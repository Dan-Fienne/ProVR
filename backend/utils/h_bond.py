import argparse
import sys
import numpy as np
import MDAnalysis as mda
from MDAnalysis.analysis.hydrogenbonds import HydrogenBondAnalysis


def prettify_atom(atom):
    """格式化 MDAnalysis Atom 对象为 chain#:RES-RESID-ATOM-(serial)"""
    chain = atom.segid.strip() or atom.chainID or "-"  # 获取链ID
    resname = atom.resname.strip()
    resid = atom.resid
    name = atom.name.strip()
    serial = atom.id  # PDB 原子序号
    return f"chain{chain}:{resname}-{resid}-{name}-({serial})"


def run_hbond_analysis(pdb_path, distance_cutoff=3.5, angle_cutoff=150.0,
                       filter_resid=None, filter_chain=None):
    u = mda.Universe(pdb_path)
    # 限制供体和受体选择字符串：
    # 合并版 Donors（含盐桥正端与芳环中的氮）
    donors_selection = (
        "(protein and ("
        "  (name N and not resname PRO)"  # 主链 N（非 PRO）
        "  or (resname LYS and name NZ)"  # Lys 正端
        "  or (resname ARG and (name NE or name NH1 or name NH2))"  # Arg 正端
        "  or (resname TRP and name NE1)"  # Trp 环氮
        "  or (resname HIS and (name ND1 or name NE2))"  # His 环氮（依质子化态）
        "  or (resname SER and name OG)"  # Ser
        "  or (resname THR and name OG1)"  # Thr
        "  or (resname TYR and name OH)"  # Tyr
        "  or (resname CYS and name SG)"  # Cys（巯基态）
        # 芳环全部原子（PHE/TYR 的苯环；TRP 的六元环；HIS 的五元环）
        "  or (resname PHE and name CG CD1 CD2 CE1 CE2 CZ)"
        "  or (resname TYR and name CG CD1 CD2 CE1 CE2 CZ)"
        "  or (resname TRP and name CD2 CE2 CE3 CD1 CZ2 CZ3)"
        "  or (resname HIS and name CG ND1 CD2 CE1 NE2)"
        "))"
    )

    # 合并版 Acceptors（含盐桥负端 + 芳环原子）
    # 警告：加入芳环碳后会把大量芳环碳也当“受体”，适用于你要统一集合后再按相互作用类型细分的场景。
    acceptors_selection = (
        "(protein and ("
        # 主链与常见侧链受体
        "  (name O or name OXT)"
        "  or (resname ASP and (name OD1 or name OD2))"
        "  or (resname GLU and (name OE1 or name OE2))"
        "  or (resname ASN and name OD1)"
        "  or (resname GLN and name OE1)"
        "  or (resname SER and name OG)"
        "  or (resname THR and name OG1)"
        "  or (resname TYR and name OH)"
        "  or (resname HIS and (name ND1 or name NE2))"
        "  or (resname CYS and name SG)"
        # 芳环全部原子（PHE/TYR 的苯环；TRP 的六元环；HIS 的五元环）
        "  or (resname PHE and name CG CD1 CD2 CE1 CE2 CZ)"
        "  or (resname TYR and name CG CD1 CD2 CE1 CE2 CZ)"
        "  or (resname TRP and name CD2 CE2 CE3 CD1 CZ2 CZ3)"
        "  or (resname HIS and name CG ND1 CD2 CE1 NE2)"
        "))"
    )
    h = HydrogenBondAnalysis(
        u,
        donors_sel="all",
        hydrogens_sel="all",  # 仅选择氢原子；在无氢情况下将为空
        acceptors_sel="all",
        between=["segid A", "segid A"],
        d_a_cutoff=distance_cutoff,
        d_h_a_angle_cutoff=angle_cutoff,
        update_selections=True
    )
    h.run()

    if not h.results.hbonds.size:
        print("### 未检测到符合阈值的氢键 ###")
        return

    hbarr = h.results.hbonds  # (n, 6) 数组: frame, donor_idx, hydrogen_idx, acceptor_idx, distance, angle
    atoms = u.atoms

    # 如果指定了残基过滤，则筛选相关氢键
    filtered_hbonds = []
    for _, donor_idx, _, acceptor_idx, dist, ang in hbarr:
        donor_atom = atoms[int(donor_idx)]
        acceptor_atom = atoms[int(acceptor_idx)]
        if donor_atom.resid == acceptor_atom.resid:
            continue  # 跳过同一残基内部的“氢键”
        # 检查是否需过滤特定残基
        if filter_resid is not None:
            # 获取原子的链ID（可能存在于 segid 或 chainID）
            atom_chain_d = donor_atom.segid.strip() or donor_atom.chainID or ""
            atom_chain_a = acceptor_atom.segid.strip() or acceptor_atom.chainID or ""
            # 判断供体或受体是否为指定残基
            if donor_atom.resid == filter_resid and (filter_chain is None or atom_chain_d == filter_chain):
                pass  # donor 符合
            elif acceptor_atom.resid == filter_resid and (filter_chain is None or atom_chain_a == filter_chain):
                pass  # acceptor 符合
            else:
                continue  # 该氢键不涉及指定残基，跳过
        # 保留符合条件的氢键，存储格式化字符串和距离角度
        donor_str = prettify_atom(donor_atom)
        acceptor_str = prettify_atom(acceptor_atom)
        filtered_hbonds.append((donor_str, acceptor_str, dist, ang))

    # 输出结果，根据是否过滤残基决定信息内容
    if filter_resid is not None:
        if not filtered_hbonds:
            chain_info = f"链{filter_chain}" if filter_chain else "所有链"
            print(f"### 残基 {filter_resid} ({chain_info}) 未参与任何氢键 ###")
            return
        count = len(filtered_hbonds)
        chain_info = f"chain{filter_chain}:" if filter_chain else ""
        print(f"# 残基 {chain_info}{filter_resid} 参与了 {count} 条氢键 "
              f"(d ≤ {distance_cutoff} Å, θ ≥ {angle_cutoff}°):\n")
    else:
        # 未过滤残基，报告总氢键数
        total = hbarr.shape[0]
        print(f"# 发现 {total} 条氢键 (d ≤ {distance_cutoff} Å, θ ≥ {angle_cutoff}°)\n")

    # 打印氢键详情
    for donor_str, acceptor_str, dist, ang in filtered_hbonds:
        print(f"{donor_str:40s} -- {acceptor_str:40s}  d={dist:4.2f} Å  θ={ang:5.1f}°")


def main(argv=None):
    parser = argparse.ArgumentParser(description="检测缺少氢原子的 PDB 结构中的氢键")
    parser.add_argument("pdb", help="输入 PDB 文件路径")
    parser.add_argument("-d", "--distance", type=float, default=8,
                        help="供体--受体距离截断 (Å)，默认 3.5")
    parser.add_argument("-a", "--angle", type=float, default=120.0,
                        help="D–H···A 角度下限 (°)，默认 150")
    parser.add_argument("-r", "--resid", type=int,
                        help="指定残基序号，只输出该残基参与的氢键")
    parser.add_argument("-c", "--chain", type=str,
                        help="指定链ID（若不提供则默认所有链匹配该序号的残基）")
    args = parser.parse_args(argv)

    try:
        run_hbond_analysis(args.pdb, args.distance, args.angle,
                           filter_resid=args.resid, filter_chain=args.chain)
    except Exception as e:
        sys.exit(f"ERROR: {e}")


if __name__ == "__main__":
    main(["9deg.pdb"])
