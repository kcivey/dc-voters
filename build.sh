#!/usr/bin/env bash

set -e
echo 'Copying files from src to public'
cp -au src/* public/
echo 'Compiling and minifying JS'
npx babel src/voters.js | \
    npx terser -c -m --toplevel --comments /Copyright/ \
    > public/voters.js
echo 'Tidying HTML'
tidy -m -w 120 -q --drop-empty-elements false --show-warnings false public/*.html \
    || [[ $? -lt 2 ]] # to avoid stopping because of warnings, just errors
# Remove end-of-line spaces tidy puts in plus beginning spaces from embedded JS templates
perl -0777 -pi -e's/^ +| +$//gm;s/\n\n+/\n/g' public/*.html
