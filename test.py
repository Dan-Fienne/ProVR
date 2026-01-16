#!/usr/bin/env python
# -*- coding:utf-8 -*-
def main():
    from backend.core.di import get_settings
    from backend.core.log import configure_logging, get_logger

    s = get_settings()
    configure_logging(s, force=True)
    logger = get_logger("demo")
    logger.info("logging ok", extra={"demo": True})

if __name__ == "__main__":
    main()