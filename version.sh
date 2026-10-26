#!/bin/sh
# Uso: ./version.sh  → pone una versión nueva en todos los lugares (index, app.js y version.json)
set -e
cd "$(dirname "$0")"
nueva=$(date +%Y%m%d%H%M)
vieja=$(sed -n 's/.*"v":"\([^"]*\)".*/\1/p' version.json)
sed -i "s/$vieja/$nueva/g" index.html js/app.js version.json
echo "versión $vieja → $nueva"
