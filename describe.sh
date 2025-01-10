#!/usr/bin/env bash
#
# describe.sh
# -----------
# Combines .py, .js, .html, .css, and .env files (only from '.' and './static')
# into ONE FILE, excluding .DS_Store, node_modules, .git, *.lock, venv, and webgazer.js.
# Also includes a tree output in the resulting file.

OUTPUT_FILE="current_project.txt"

# Remove the old combined file, if any
rm -f "$OUTPUT_FILE"

echo "Combining specified files from '.' and './static' into $OUTPUT_FILE..."

##
# 1) Print a 'tree' view into the file for verification
##
echo "===== Project Tree =====" >> "$OUTPUT_FILE"
tree \
  . ./static \
  -I 'node_modules|\.git|\.DS_Store|.*\.lock|venv|webgazer\.js' \
  -P '*.py|*.js|*.html|*.css|.env' \
  --prune \
  >> "$OUTPUT_FILE"

echo -e "\n===== Begin Code Excerpts =====\n" >> "$OUTPUT_FILE"

##
# 2) Gather all target files and concatenate them into the file
##
find . ./static \
  \( -name ".DS_Store" \
     -o -path "*/node_modules" \
     -o -path "*/venv" \
     -o -path "*/.git" \
     -o -name "*.lock" \
     -o -name "webgazer.js" \
  \) -prune -o \
  -type f \
  \( -name "*.py" -o -name "*.js" -o -name "*.html" -o -name "*.css" -o -name ".env" \) \
  -print \
| while read -r file; do
  echo "----- BEGIN $file -----" >> "$OUTPUT_FILE"
  cat "$file" >> "$OUTPUT_FILE"
  echo -e "\n----- END $file -----\n" >> "$OUTPUT_FILE"
done

echo "Done. See '$OUTPUT_FILE' for the combined codebase."