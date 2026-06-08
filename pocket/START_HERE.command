#!/usr/bin/env bash
# macOS launcher — opens Terminal.app and runs START_HERE.sh
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
osascript -e "tell application \"Terminal\" to do script \"cd '$DIR' && bash START_HERE.sh\""
