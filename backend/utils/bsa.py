#!/usr/bin/env python
# -*- coding:utf-8 -*-

# !/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations
import argparse
import logging
import os
import sys
import tempfile
from typing import Iterable, List, Sequence, Set, Tuple

import freesasa

# --------------------------- Logging ---------------------------

LOGGER = logging.getLogger("bsa")

# --------------------------- PDB utils ---------------------------

PDB_ATOM_RECORDS = ("ATOM  ", "HETATM")


def read_pdb_lines(pdb_path: str) -> List[str]:
    if not os.path.isfile(pdb_path):
        raise FileNotFoundError(f"PDB file not found: {pdb_path}")
    with open(pdb_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.read().splitlines()
    if not lines:
        raise ValueError(f"PDB file is empty: {pdb_path}")
    return lines


def extract_present_chains(lines: Sequence[str], include_hetatm: bool = True) -> Set[str]:
    present: Set[str] = set()
    for line in lines:
        if line.startswith("ATOM  ") or (include_hetatm and line.startswith("HETATM")):
            if len(line) >= 22:  # chain ID column (1-based col 22)
                present.add(line[21])
    return present


def filter_pdb_by_chains(
        lines: Sequence[str],
        chains: Set[str],
        include_hetatm: bool = True,
) -> List[str]:
    """
    Keep only ATOM/HETATM lines whose chain ID is in `chains`.
    Other records are dropped for determinism.
    """
    if not chains:
        return []

    out: List[str] = []
    for line in lines:
        if line.startswith("ATOM  ") or (include_hetatm and line.startswith("HETATM")):
            if len(line) >= 22 and line[21] in chains:
                out.append(line)
    return out


def write_temp_pdb(lines: Sequence[str], keep: bool = False, tag: str = "") -> str:
    """
    Writes a temporary PDB file. On Windows, NamedTemporaryFile must be closed
    before reuse, so we use delete=False and unlink later if keep=False.
    """
    suffix = f".{tag}.pdb" if tag else ".pdb"
    tmp = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=suffix, newline="\n", encoding="utf-8")
    try:
        for ln in lines:
            tmp.write(ln.rstrip("\n") + "\n")
    finally:
        tmp.close()
    if keep:
        LOGGER.debug("Kept temp PDB: %s", tmp.name)
    return tmp.name


# --------------------------- FreeSASA utils ---------------------------

def _make_params(probe: float) -> freesasa.Parameters:
    """
    Create Parameters and set probe radius with cross-version compatibility.
    """
    params = freesasa.Parameters()
    # Newer versions support setProbeRadius; older may accept constructor kw.
    try:
        params.setProbeRadius(probe)
    except AttributeError:
        try:
            params = freesasa.Parameters(probeRadius=probe)  # type: ignore
        except TypeError:
            LOGGER.warning("Could not set probe radius on this FreeSASA version; using default.")
    return params


def compute_sasa_from_pdb(pdb_path: str, probe: float) -> float:
    params = _make_params(probe)
    structure = freesasa.Structure(pdb_path)
    result = freesasa.calc(structure, params)
    return float(result.totalArea())


# --------------------------- BSA core ---------------------------

def parse_chain_list(inp: Iterable[str] | str) -> List[str]:
    """
    Accepts:
    - comma/space/semicolon/pipe separated string, e.g. "A,B" or "H L" or "H|L"
    - list/tuple of chain IDs

    Returns a unique-preserving list of non-empty one-character chain IDs.
    If tokens are longer than 1 char, their first character is used and a warning is logged.
    """
    if isinstance(inp, str):
        # Normalize separators to spaces
        for sep in [",", ";", "|", "/"]:
            inp = inp.replace(sep, " ")
        tokens = [t.strip() for t in inp.split() if t.strip()]
    else:
        tokens = [str(t).strip() for t in inp if str(t).strip()]

    seen: Set[str] = set()
    out: List[str] = []
    for t in tokens:
        if len(t) != 1:
            LOGGER.warning("Chain ID '%s' has length %d; using first character '%s'.", t, len(t), t[0])
            t = t[0]
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def compute_bsa(
        pdb_file: str,
        chains_ab: Sequence[str] | str,
        chains_ag: Sequence[str] | str,
        probe: float = 1.4,
        include_hetatm: bool = True,
        keep_temps: bool = False,
) -> Tuple[float, float, float, float, float]:
    """
    Compute BSA between AB and AG chain sets.

    Returns tuple:
        (bsa, delta_asa, asa_ab_iso, asa_ag_iso, asa_complex)
    Units: Å^2
    """
    # Parse and validate chain lists
    ab = parse_chain_list(chains_ab)
    ag = parse_chain_list(chains_ag)
    if not ab or not ag:
        raise ValueError("Both --ab and --ag must contain at least one chain ID.")

    overlap = set(ab) & set(ag)
    if overlap:
        raise ValueError(f"AB and AG chain sets must be disjoint; overlap: {sorted(overlap)}")

    # Load and validate PDB
    lines = read_pdb_lines(pdb_file)
    present = extract_present_chains(lines, include_hetatm=include_hetatm)
    missing_ab = [c for c in ab if c not in present]
    missing_ag = [c for c in ag if c not in present]
    if missing_ab or missing_ag:
        raise ValueError(
            "Some requested chains are not present in PDB.\n"
            f"  Present chains: {sorted(present) if present else 'none'}\n"
            f"  Missing in AB: {missing_ab or 'none'}\n"
            f"  Missing in AG: {missing_ag or 'none'}"
        )

    # Build filtered PDBs
    ab_set, ag_set = set(ab), set(ag)
    complex_set = ab_set | ag_set

    ab_only_lines = filter_pdb_by_chains(lines, ab_set, include_hetatm=include_hetatm)
    ag_only_lines = filter_pdb_by_chains(lines, ag_set, include_hetatm=include_hetatm)
    complex_lines = filter_pdb_by_chains(lines, complex_set, include_hetatm=include_hetatm)

    if not ab_only_lines:
        raise ValueError("No atoms found for AB selection after filtering.")
    if not ag_only_lines:
        raise ValueError("No atoms found for AG selection after filtering.")
    if not complex_lines:
        raise ValueError("No atoms found for AB∪AG selection after filtering.")

    # Write temp files
    ab_pdb = write_temp_pdb(ab_only_lines, keep=keep_temps, tag="ab")
    ag_pdb = write_temp_pdb(ag_only_lines, keep=keep_temps, tag="ag")
    complex_pdb = write_temp_pdb(complex_lines, keep=keep_temps, tag="complex")

    try:
        # Compute SASA
        asa_ab_iso = compute_sasa_from_pdb(ab_pdb, probe)
        asa_ag_iso = compute_sasa_from_pdb(ag_pdb, probe)
        asa_complex = compute_sasa_from_pdb(complex_pdb, probe)

        delta_asa = asa_ab_iso + asa_ag_iso - asa_complex
        bsa = delta_asa / 2.0

        LOGGER.info("ASA_AB_iso = %.3f Å² | ASA_AG_iso = %.3f Å² | ASA_complex = %.3f Å²",
                    asa_ab_iso, asa_ag_iso, asa_complex)
        LOGGER.info("ΔASA = %.3f Å² | BSA = %.3f Å²", delta_asa, bsa)

        return bsa, delta_asa, asa_ab_iso, asa_ag_iso, asa_complex
    finally:
        # Clean up temps unless requested
        if not keep_temps:
            for p in (ab_pdb, ag_pdb, complex_pdb):
                try:
                    os.unlink(p)
                except Exception:
                    pass


# --------------------------- CLI ---------------------------

def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Compute BSA between two partners defined by PDB chain IDs using FreeSASA.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("-i", "--input", required=False, help="Input PDB file")
    p.add_argument("--ab", required=False, help="Chains for partner AB (e.g., 'A,B' or 'H L')")
    p.add_argument("--ag", required=False, help="Chains for partner AG (e.g., 'C,D' or 'A')")
    p.add_argument("--probe", type=float, default=1.4, help="Probe radius in Å")
    p.add_argument("--exclude-hetatm", action="store_true", help="Exclude HETATM records")
    p.add_argument("--keep-temp", action="store_true", help="Keep intermediate temp PDBs for debugging")
    p.add_argument("--verbose", "-v", action="count", default=0, help="Increase verbosity (-v, -vv)")
    return p


def setup_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = build_argparser().parse_args(argv)
    setup_logging(args.verbose)

    lsa = ['A192.pdb']
    for i in lsa:
        args.input = i
        args.ab = 'C,D'
        args.ag = 'A,B'

        try:
            bsa, delta, asa_ab, asa_ag, asa_complex = compute_bsa(
                pdb_file=args.input,
                chains_ab=args.ab,
                chains_ag=args.ag,
                probe=args.probe,
                include_hetatm=not args.exclude_hetatm,
                keep_temps=args.keep_temp,
            )
            print(
                f"{os.path.basename(args.input)}\t"
                f"ASA_AB_iso={asa_ab:.1f} Å²\t"
                f"ASA_AG_iso={asa_ag:.1f} Å²\t"
                f"ASA_complex={asa_complex:.1f} Å²\t"
                f"ΔASA={delta:.1f} Å²\t"
                f"BSA={bsa:.1f} Å²"
            )
            return 0
        except Exception as e:
            LOGGER.error("Failed to compute BSA: %s", e)
            if args.verbose >= 2:
                raise
            else:
                return 1


if __name__ == "__main__":
    sys.exit(main())
