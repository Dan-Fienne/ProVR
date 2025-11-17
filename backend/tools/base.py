#!/usr/bin/env python
# -*- coding:utf-8 -*-
from pathlib import Path


def get_root() -> Path:
    return Path(__file__).resolve().parents[2]


if __name__ == '__main__':
    print(get_root())