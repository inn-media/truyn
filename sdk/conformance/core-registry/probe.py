import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"python"/"src"))
from truyn.core_registry import lookup_core_code, require_executable_core_code
for code in sys.argv[1:]:
    e=lookup_core_code(code)
    if e is None:
        print(f"{code}|UNKNOWN")
        continue
    try:
        allowed=require_executable_core_code(code)["code"] == code
    except ValueError:
        allowed=False
    print("|".join([e["code"],e["short"] or "",e["name"],e["className"],e["form"],e["admission"],e["wire"],str(allowed).lower()]))
