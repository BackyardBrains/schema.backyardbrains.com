#!/usr/bin/env bash
#
# describe.sh
# -----------
# Combines .py, .js, .html, .css, and .env files from '.' (including subdirs)
# into ONE FILE, excluding .DS_Store, node_modules, .git, *.lock, venv, webgazer.js
# Also includes a tree output (no summary), then code excerpts, overwriting output file each run.

OUTPUT_FILE="current_project.txt"

echo "Generating $OUTPUT_FILE..."

###
# (1) Print the 'tree' view.
#     --noreport kills the "29 directories, 37 files" summary line
###
{
  echo "===== Project Tree ====="
  tree . \
    -I 'node_modules|\.git|\.DS_Store|.*\.lock|venv|webgazer\.js' \
    -P '*.py|*.js|*.html|*.css|.env' \
    --prune \
    --noreport
  echo -e "\n===== Begin Code Excerpts =====\n"
} > "$OUTPUT_FILE"  # Overwrite the file here


###
# (2) Collect paths in the same order 'tree' uses.
#     - -fi => full path, no indentation
#     - --noreport => no summary line
#     - Exclude directories more carefully:
#         - Remove lines ending in '/' (the majority of directories).
#         - Remove lines that are just '.' 
#         - Possibly remove lines that are just './static'
###
tree_files=$(
  tree -fi . \
    -I 'node_modules|\.git|\.DS_Store|.*\.lock|venv|webgazer\.js' \
    -P '*.py|*.js|*.html|*.css|.env' \
    --prune \
    --noreport \
  | sed -e '/\/$/d' \
  | sed -e '/^\.$/d' \
  | sed -e '/^\.\/static$/d' \
  | awk '!seen[$0]++'    # remove duplicates if any
)

###
# (3) Loop over each file and append to the output in the same order
###
while IFS= read -r file; do
  # Might want to skip if it's a directory that *somehow* slipped past
  # but let's assume sed + slash removal is enough.
  if [ -f "$file" ]; then
    echo "----- BEGIN $file -----" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
    echo -e "\n----- END $file -----\n" >> "$OUTPUT_FILE"
  fi
done <<< "$tree_files"

echo "Done. See '$OUTPUT_FILE' for the combined codebase."