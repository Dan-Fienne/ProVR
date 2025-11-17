#!/usr/bin/env python
# -*- coding:utf-8 -*-
from pymol import cmd
import re


def parse_version(version):
    """解析字符串为一个元组，其中包含数字部分和字母部分"""
    match = re.match(r'(\d+)([A-Z]*)', version)
    if match:
        num_part = int(match.group(1))
        letter_part = match.group(2)
        return (num_part, letter_part)
    return (0, '')


def custom_str_compare(s1, s2):
    num1, letter1 = parse_version(s1)
    num2, letter2 = parse_version(s2)

    if letter1 == letter2:
        return abs(num1 - num2)
    else:
        return abs(num1 - num2) + (ord(letter1) - ord(letter2))


def parse_pdb_lines_for_sheets(pdb_lines):
    residues = []
    for line in pdb_lines:
        if line.startswith("ATOM") and " CA " in line:
            res_name = line[17:20].strip()
            chain_id = line[21].strip()
            res_seq = line[22:26].strip()
            residues.append((res_name, chain_id, res_seq))
    return residues


def identify_sheets(residues):
    sheet_ranges = []
    start = None
    for i in range(len(residues) - 1):
        current_res = residues[i]
        next_res = residues[i + 1]
        # Check for sequential residues in the same chain
        if custom_str_compare(next_res[2], current_res[2]) == 1 and next_res[1] == current_res[1]:
            if start is None:
                start = current_res
        else:
            if start:
                sheet_ranges.append((start, current_res))
                start = None
    # Check if the last segment forms a sheet
    if start:
        sheet_ranges.append((start, residues[-1]))

    return sheet_ranges


def process_pdb(pdb_data):
    pdb_lines = pdb_data.strip().split("\n")
    residues = parse_pdb_lines_for_sheets(pdb_lines)
    sheet_ranges = identify_sheets(residues)
    return sheet_ranges


def generate_sheet_entries(sheet_ranges):
    sheet_entries = []
    sheet_count = 1

    for start, end in sheet_ranges:
        start_res_name, start_chain_id, start_res_seq = start
        end_res_name, end_chain_id, end_res_seq = end
        sheet_entry = (
            f"SHEET  {sheet_count:>3} {'A10':>5} {start_res_name:>3} {start_chain_id:>1}"
            f"{start_res_seq:>4}  {end_res_name:<3} {end_chain_id:<1}{end_res_seq:>4}  0"
        )
        sheet_entries.append(sheet_entry)
        sheet_count += 1

    return "\n".join(sheet_entries)


def generate_helix_entries(helix_ranges):
    helix_entries = []
    helix_count = 1

    for start, end in helix_ranges:
        start_res_name, start_chain_id, start_res_seq = start
        end_res_name, end_chain_id, end_res_seq = end
        length = custom_str_compare(end_res_seq, start_res_seq) + 1
        helix_entry = (
            f"HELIX  {helix_count:>3} {helix_count:>3} {start_res_name:<3} {start_chain_id:<1}"
            f"{start_res_seq:>5}  {end_res_name:<3} {end_chain_id:<1}{end_res_seq:>5} {1:>2}"
            f"{length:>36}"
        )
        helix_entries.append(helix_entry)
        helix_count += 1

    return "\n".join(helix_entries)


def get_ss_from_pymol(path):
    cmd.load(path, 'proteinA')
    obj = "proteinA"
    cmd.select("helices", f"{obj} and ss H")
    cmd.select("sheets", f"{obj} and ss S")
    helix_residues = cmd.get_pdbstr("helices")
    helix_ranges = process_pdb(helix_residues)
    helix_str = generate_helix_entries(helix_ranges)
    sheet_residues = cmd.get_pdbstr("sheets")
    sheet_ranges = process_pdb(sheet_residues)
    sheet_str = generate_sheet_entries(sheet_ranges)

    second_struc = helix_str + '\n' + sheet_str + '\n'
    with open(path, 'r', encoding='utf-8') as fr:
        data = fr.read()
    cmd.delete("proteinA")
    cmd.delete("helices")
    cmd.delete("sheets")
    return second_struc + data

if __name__ == '__main__':
    a = get_ss_from_pymol("output5.pdb")
    print(a)
    with open("../data/nfdb5.pdb", 'w', encoding='utf-8') as fw:
        fw.write(a)