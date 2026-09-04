#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-write-retention.py <campaign>')

campaign = Path(sys.argv[1])
if not campaign.is_file():
    raise SystemExit(f'campaign not found: {campaign}')

text = campaign.read_text()

durable_marker = 'STAGE=durable-writes\n'
restart_marker = '\nSTAGE=restart-recovery\n'
retention_marker = '\nSTAGE=write-retention\n'
resources_marker = '\nSTAGE=resources\n'

for label, marker in [
    ('durable-writes', durable_marker),
    ('restart-recovery', restart_marker),
    ('write-retention', retention_marker),
    ('resources', resources_marker),
]:
    if text.count(marker) != 1:
        raise SystemExit(f'unexpected {label} stage count')

durable_start = text.index(durable_marker)
restart_start = text.index(restart_marker, durable_start)
durable = text[durable_start:restart_start]
if durable.count('ttlMs:1800000') != 1:
    raise SystemExit('unexpected durable write TTL marker count')
if 'd200_durable_write_ttl_ms=' in durable:
    raise SystemExit('D-200 durable write TTL patch already applied')
if 'writes=0\n' not in durable:
    raise SystemExit('durable writes counter marker missing')
if '[[ "$writes" == 100 ]]\n' not in durable:
    raise SystemExit('durable writes acceptance marker missing')

durable = durable.replace(
    'writes=0\n',
    'writes=0\n'
    'd200_durable_write_ttl_ms=21600000\n'
    'd200_write_window_start_ms=$(date +%s%3N)\n',
    1,
)
durable = durable.replace('ttlMs:1800000', 'ttlMs:${d200_durable_write_ttl_ms}', 1)
durable = durable.replace(
    '[[ "$writes" == 100 ]]\n'
    'echo "TRUYN_CLASS_D_1000 stage=durable-writes acknowledged=${writes} status=PASS"\n',
    '[[ "$writes" == 100 ]]\n'
    'd200_write_window_last_ack_ms=$(date +%s%3N)\n'
    'echo "TRUYN_CLASS_D_1000 stage=durable-writes acknowledged=${writes} ttlMs=${d200_durable_write_ttl_ms} '
    'writeWindowMs=$((d200_write_window_last_ack_ms-d200_write_window_start_ms)) status=PASS"\n',
    1,
)

retention_start = text.index(retention_marker, restart_start)
resources_start = text.index(resources_marker, retention_start)
retention = text[retention_start + 1:resources_start]
if retention.count('retained=$(marker "$out" RETAINED)') != 1:
    raise SystemExit('unexpected retention marker count')
if retention.count('ack_loss=$((writes-retained))') != 1:
    raise SystemExit('unexpected acknowledged write loss marker count')
if retention.count('[[ "$ack_loss" == 0 ]]') != 1:
    raise SystemExit('unexpected write retention acceptance marker count')

retention = retention.replace(
    'STAGE=write-retention\n',
    'STAGE=write-retention\n'
    'd200_retention_required_margin_ms=900000\n'
    'd200_retention_start_ms=$(date +%s%3N)\n'
    'd200_retention_age_start_ms=$((d200_retention_start_ms-d200_write_window_start_ms))\n'
    'if (( d200_retention_age_start_ms + d200_retention_required_margin_ms >= d200_durable_write_ttl_ms )); then\n'
    '  echo "TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=before-check ttlMs=${d200_durable_write_ttl_ms} '
    'ageMs=${d200_retention_age_start_ms} requiredMarginMs=${d200_retention_required_margin_ms}" >&2\n'
    '  false\n'
    'fi\n',
    1,
)
retention = retention.replace(
    'retained=$(marker "$out" RETAINED)\n'
    'ack_loss=$((writes-retained))\n',
    'retained=$(marker "$out" RETAINED)\n'
    'd200_retention_end_ms=$(date +%s%3N)\n'
    'd200_retention_age_end_ms=$((d200_retention_end_ms-d200_write_window_start_ms))\n'
    'if (( d200_retention_age_end_ms >= d200_durable_write_ttl_ms )); then\n'
    '  echo "TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=after-check ttlMs=${d200_durable_write_ttl_ms} '
    'ageMs=${d200_retention_age_end_ms}" >&2\n'
    '  false\n'
    'fi\n'
    'ack_loss=$((writes-retained))\n',
    1,
)
retention = retention.replace(
    'echo "TRUYN_CLASS_D_1000 stage=write-retention retained=${retained}/${writes} acknowledgedWriteLoss=${ack_loss}"',
    'echo "TRUYN_CLASS_D_1000 stage=write-retention retained=${retained}/${writes} acknowledgedWriteLoss=${ack_loss} '
    'ttlMs=${d200_durable_write_ttl_ms} ageStartMs=${d200_retention_age_start_ms} ageEndMs=${d200_retention_age_end_ms}"',
    1,
)

patched = text[:durable_start] + durable + text[restart_start:retention_start + 1] + retention + text[resources_start:]

required = [
    'd200_durable_write_ttl_ms=21600000',
    'd200_retention_required_margin_ms=900000',
    'TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=before-check',
    'TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=after-check',
    'ttlMs=${d200_durable_write_ttl_ms}',
    'ageStartMs=${d200_retention_age_start_ms}',
    'ageEndMs=${d200_retention_age_end_ms}',
]
for marker in required:
    if marker not in patched:
        raise SystemExit(f'missing write-retention diagnostic marker: {marker}')

patched_durable_start = patched.index(durable_marker)
patched_restart_start = patched.index(restart_marker, patched_durable_start)
patched_durable = patched[patched_durable_start:patched_restart_start]
if patched_durable.count('ttlMs:${d200_durable_write_ttl_ms}') != 1:
    raise SystemExit('unexpected patched durable TTL count')
if 'ttlMs:1800000' in patched_durable:
    raise SystemExit('expired 30-minute durable TTL remained after patch')
if "assert float('$healed_rate') >= .99, '$healed_rate'" not in patched:
    raise SystemExit('strict healed acceptance changed unexpectedly')
if '[[ "$ack_loss" == 0 ]]' not in patched:
    raise SystemExit('acknowledged write retention gate changed unexpectedly')

campaign.write_text(patched)
print('TRUYN_D200_WRITE_RETENTION_PATCH=PASS ttlMs=21600000 marginMs=900000')
