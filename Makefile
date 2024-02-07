OUTPUT := workspaceWizard.vsix

$(OUTPUT): CHANGELOG.md extension.js icon.png LICENSE.md package.json README.md
	vsce package -o $(OUTPUT)

install: $(OUTPUT)
	code --install-extension $(OUTPUT)
