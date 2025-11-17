#!/usr/bin/env python
# -*- coding:utf-8 -*-


def rename_chains(input_pdb: str, output_pdb: str, chain_map: dict):
    with open(input_pdb, 'r') as infile, open(output_pdb, 'w') as outfile:
        for line in infile:
            # ATOM 与 HETATM 行才修改链信息；其它（HEADER, REMARK, TER等）不改
            if line.startswith(('ATOM  ', 'HETATM')):
                if len(line) >= 22:  # 确保行够长
                    old_chain = line[21].strip()
                    if old_chain in chain_map:
                        new_chain = chain_map[old_chain]
                        # 重新拼接该行：位置21替换为新链名
                        line = line[:21] + new_chain + line[22:]
            outfile.write(line)
        print(f"链名替换完成，输出已写入: {output_pdb}")


if __name__ == '__main__':
    in_pdb = "lbs2.pdb"
    out_pdb = "../data/lbs2.pdb"
    # c_map = {"B": "A", "D": "B", "F": "C", "H": "D", "J": "E"}
    # c_map = {"B": "F", "D": "G", "F": "H", "H": "I", "J": "J"}
    # c_map = {"B": "K", "D": "L", "F": "M", "H": "N", "J": "O"}
    c_map = {"B": "P", "D": "Q", "F": "R", "H": "S", "J": "T"}
    rename_chains(in_pdb, out_pdb, c_map)
