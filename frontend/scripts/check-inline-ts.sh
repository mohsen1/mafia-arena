#!/bin/bash
# Check for TypeScript type annotations in inline scripts that won't be compiled
# This catches: <script define:vars>, <script is:inline>

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

ERRORS=0

echo "Checking for TypeScript type annotations in inline scripts..."

# Find all .astro files and check for TS patterns in inline scripts
for file in $(find src -name "*.astro"); do
    # Use awk to extract inline script blocks and check for TS syntax
    # Pattern explanation:
    # - `\b(let|const|var)\s+\w+\s*:` - variable declarations with type annotations
    # - `\(\w+\s*:\s*(string|number|boolean|any)` - function params with types  
    # - `\)\s*:\s*(string|number|boolean|any|void|Promise)` - return type annotations
    # - `<[A-Z][a-zA-Z]+>` - generic type params (but not HTML tags)
    
    result=$(awk '
        /<script[^>]*(define:vars|is:inline)/{p=1; next}
        /<\/script>/{p=0; next}
        p{
            # Match variable declarations with type annotations
            # e.g., let batchName: string = ...
            if(/\b(let|const|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*[a-zA-Z]/) {
                print FILENAME ":" NR ": " $0
            }
            # Match function parameters with type annotations  
            # e.g., function foo(x: string)
            else if(/\([^)]*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*(string|number|boolean|any|unknown|void|never|null|undefined|Record|Array|Map|Set|Promise|object)\b/) {
                print FILENAME ":" NR ": " $0
            }
            # Match return type annotations
            # e.g., function foo(): string
            else if(/\)\s*:\s*(string|number|boolean|any|unknown|void|never|null|undefined|Record|Array|Map|Set|Promise|object)\b/) {
                print FILENAME ":" NR ": " $0
            }
            # Match generic type parameters in variable context (not JSX)
            # e.g., new Map<string, number>
            else if(/\b(new\s+)?(Map|Set|Array|Promise|Record)\s*</) {
                print FILENAME ":" NR ": " $0
            }
        }
    ' "$file")
    
    if [ -n "$result" ]; then
        echo -e "${RED}ERROR: TypeScript syntax found in inline script:${NC}"
        echo "$result"
        echo ""
        ERRORS=$((ERRORS + 1))
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}Found $ERRORS file(s) with TypeScript in inline scripts!${NC}"
    echo ""
    echo "TypeScript is NOT compiled in <script define:vars> or <script is:inline> blocks."
    echo "Remove type annotations or move complex logic to separate .ts files."
    exit 1
else
    echo -e "${GREEN}✓ No TypeScript found in inline scripts${NC}"
fi
