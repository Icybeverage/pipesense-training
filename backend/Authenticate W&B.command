#!/bin/zsh
cd -- "${0:A:h}" || exit 1
.venv/bin/python authenticate.py
read -r "reply?Press Return to close. "
