OUTPUT := workspaceWizard.vsix

$(OUTPUT): .vscodeignore CHANGELOG.md LICENSE.md README.md extension.js icon.png node_modules package.json
	node node_modules/@vscode/vsce/vsce package -o $(OUTPUT)

node_modules:
	npm install

install: $(OUTPUT)
	code --install-extension $(OUTPUT)
