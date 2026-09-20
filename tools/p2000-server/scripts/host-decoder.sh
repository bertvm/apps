#!/usr/bin/env bash
# Run on the Pi host: decode P2000 FLEX and feed the publisher FIFO.
set -euo pipefail

FREQ="${P2000_FREQUENCY:-169.65M}"
RATE="${P2000_SAMPLE_RATE:-22050}"
PIPE="${P2000_PIPE_PATH:-./data/flex.pipe}"

mkdir -p "$(dirname "$PIPE")"
if [[ ! -p "$PIPE" ]]; then
  mkfifo "$PIPE"
fi

echo "Writing FLEX JSON to $PIPE (freq=$FREQ)" >&2
exec bash -c "rtl_fm -f ${FREQ} -M fm -s ${RATE} -g 40 -l 0 -E dc -F 0 - | multimon-ng -t raw -a FLEX --json - >> '${PIPE}'"
