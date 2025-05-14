#!/bin/bash
# describe.sh
# -----------
# Combines .py, .js, .html, .css, and .env files from '.' (including subdirs)
# into ONE FILE, excluding .DS_Store, node_modules, .git, *.lock, venv, webgazer.js
# Also includes a tree output (no summary), then code excerpts, overwriting output file each run.

set -e  # Exit on error

OUTPUT_FILE="current_project.txt"
TEMP_FILE=$(mktemp)

# Cleanup function
cleanup() {
    rm -f "$TEMP_FILE"
}
trap cleanup EXIT

# Check if tree is installed
if ! command -v tree &> /dev/null; then
    echo "Error: 'tree' command is not installed. Please install it first."
    echo "On macOS: brew install tree"
    echo "On Ubuntu/Debian: sudo apt-get install tree"
    exit 1
fi

echo "Generating $OUTPUT_FILE..."

# Generate tree view
echo "===== Project Tree =====" > "$OUTPUT_FILE"
tree . -I "node_modules|.git|.DS_Store|*.lock|venv|webgazer.js" -P "*.py|*.js|*.html|*.css|.env" --prune --noreport >> "$OUTPUT_FILE"
echo -e "\n===== Begin Code Excerpts =====\n" >> "$OUTPUT_FILE"

# Get list of files
tree -fi . -I "node_modules|.git|.DS_Store|*.lock|venv|webgazer.js" -P "*.py|*.js|*.html|*.css|.env" --prune --noreport > "$TEMP_FILE"

# Process each file
while read -r file; do
    # Skip empty lines
    [ -z "$file" ] && continue
    
    # Skip directories and non-existent files
    [ ! -f "$file" ] && continue
    
    echo "Processing: $file"
    echo "----- BEGIN $file -----" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE" 2>/dev/null || echo "Error reading file: $file" >&2
    echo -e "\n----- END $file -----\n" >> "$OUTPUT_FILE"
done < "$TEMP_FILE"

echo "Done. See '$OUTPUT_FILE' for the combined codebase."