#!/usr/bin/env bash

set -e
typeset -i PAGES P I FLIP_BACK
P=1
FLIP_BACK=0
for PDF in "$@"
do
    echo $PDF
    if [[ $PDF = '--flip-back' ]]
    then
        echo 'Flip back sides of pages'
        FLIP_BACK=1
        continue
    fi
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
        if [[ ! -e $F ]]
        then
            convert -density 200 $PDF\[$[$I - 1]\] -strip +profile '*' -interlace plane -gaussian-blur 0.05 -quality 75% $F
            if (( (P % 2) && $FLIP_BACK ))
            then
                echo 'Flipping'
                convert $F -rotate 180 temp.jpeg
                mv temp.jpeg $F
            fi
        fi
        let P++
    done;
done
