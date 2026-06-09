import os
import zlib
import base64
import string
import urllib.request
import sys

def plantuml_encode(plantuml_text):
    zlibbed_str = zlib.compress(plantuml_text.encode('utf-8'))
    compressed_string = zlibbed_str[2:-4]
    
    plantuml_alphabet = string.digits + string.ascii_uppercase + string.ascii_lowercase + '-_'
    base64_alphabet = string.ascii_uppercase + string.ascii_lowercase + string.digits + '+/'
    
    b64_to_plantuml = bytes.maketrans(base64_alphabet.encode('utf-8'), plantuml_alphabet.encode('utf-8'))
    return base64.b64encode(compressed_string).translate(b64_to_plantuml).decode('utf-8')

def main():
    workspace_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    plantuml_dir = os.path.join(workspace_dir, 'plantuml')
    assets_dir = os.path.join(workspace_dir, 'assets')
    
    if not os.path.exists(plantuml_dir):
        os.makedirs(plantuml_dir)
        print(f"Created plantuml directory at {plantuml_dir}")
        
    if not os.path.exists(assets_dir):
        os.makedirs(assets_dir)
        
    puml_files = [f for f in os.listdir(plantuml_dir) if f.endswith('.puml')]
    if not puml_files:
        print("No .puml files found in plantuml directory.")
        return

    print(f"Found {len(puml_files)} .puml files. Rendering...")
    
    success_count = 0
    for puml_file in puml_files:
        puml_path = os.path.join(plantuml_dir, puml_file)
        png_name = puml_file[:-5] + '.png'
        png_path = os.path.join(assets_dir, png_name)
        
        print(f"Rendering {puml_file} -> {png_name}...")
        try:
            with open(puml_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # If @startuml/@enduml is not in the file, wrap it
            if '@startuml' not in content:
                content = '@startuml\n' + content + '\n@enduml'
                
            encoded = plantuml_encode(content)
            url = f"http://www.plantuml.com/plantuml/png/{encoded}"
            
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req) as response:
                if response.status == 200:
                    with open(png_path, 'wb') as img_file:
                        img_file.write(response.read())
                    print(f"  Successfully saved to assets/{png_name}")
                    success_count += 1
                else:
                    print(f"  Failed: HTTP status {response.status}")
        except Exception as e:
            print(f"  Error rendering {puml_file}: {e}")
            
    print(f"Finished rendering: {success_count}/{len(puml_files)} succeeded.")

if __name__ == '__main__':
    main()
