#!/bin/sh
# Bump the build number everywhere so phones pick up the new version, then push.
V=$(date +%Y%m%d%H%M%S)
sed -i -E "s#\?v=[0-9]+#?v=$V#g" index.html
sed -i -E "s#const APP_V=\"[0-9]+\";#const APP_V=\"$V\";#" app.js
printf '{"v":"%s"}\n' "$V" > version.json
echo "build $V"
