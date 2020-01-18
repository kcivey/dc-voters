#!/usr/bin/env bash

set -e
typeset -i PAGES P I
P=1
for PDF in "$@"
do
    echo $PDF
    if [[ $PDF =~ ([0-9]+) ]]
    then
        P=$(( (${BASH_REMATCH[1]} * 2) - 1 ))
    else
        echo "No number in $PDF"
    fi
    PAGES=$(pdfinfo $PDF | grep Pages | awk '{ print $2 }')
    for (( I = 1; I <= PAGES; I++ ))
    do
        echo $I
        F=$(printf '../public/page-images/%04d%s.jpeg' $(( (P + 1) / 2 )) $(if (( $P % 2 )); then echo 'a'; else echo 'b'; fi))
        echo $F
        convert -density 200 $PDF\[$[$I - 1]\] -strip +profile '*' -interlace plane -gaussian-blur 0.05 -quality 75% $F
        let P++
    done;
done
