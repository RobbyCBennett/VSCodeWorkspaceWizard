const vscode = require('vscode');


//
// Data
//

let tree;
let config;


//
// Tree Data Provider
//

class WorkspaceTreeDataProvider
{
	_onDidChangeTreeData;
	onDidChangeTreeData;

	constructor()
	{
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}

	async getChildren(treeItem)
	{
		return new Promise(async (resolve, reject) =>
		{
			// Get path
			let uri;
			// Get path of the main folder
			if (!treeItem) {
				updateConfigCache();
				uri = vscode.Uri.file(config.general.folder);
				if (!uri)
					return resolve([]);
			}
			// Get path of a sub-folder
			else
				uri = treeItem.uri;

			// Get children of the path
			let files;
			try {
				files = await vscode.workspace.fs.readDirectory(uri);
			} catch (error) {
				popupError(`Unable to open ${uri.fsPath}`);
			}
			if (!files || !files.length)
				return resolve([]);

			// Create tree items for files
			const treeItems = [];
			for (const [name, fileType] of files) {
				// File
				if (fileType & vscode.FileType.File) {
					if (/\.code-workspace$/.test(name))
						treeItems.push(new WorkspaceFileTreeItem(uri, name));
				}
				// Folder
				else
					treeItems.push(new SubFolderTreeItem(uri, name));
			}

			return resolve(treeItems);
		});
	}

	getTreeItem(treeItem)
	{
		return treeItem;
	}

	refresh()
	{
		this._onDidChangeTreeData.fire();
	}
}

class SubFolderTreeItem extends vscode.TreeItem
{
	contextValue;
	uri;

	constructor(uri, name)
	{
		super(
			name,
			config.sidebar.expand
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.Collapsed
		);
		this.contextValue = 'folder'
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}

class WorkspaceFileTreeItem extends vscode.TreeItem
{
	contextValue;
	uri;

	constructor(uri, name)
	{
		super(
			name.slice(0, -15),
			vscode.TreeItemCollapsibleState.None
		);
		this.contextValue = 'workspace'
		this.uri = vscode.Uri.joinPath(uri, name);
	}

	open()
	{
		popup('TODO OPEN THIS WORKSPACE');
	}
}


//
// Helper Functions
//

const logger = vscode.window.createOutputChannel('Workspace Wizard');
function log(message)
{
	if (typeof message === 'string')
		logger.appendLine(message);
	else
		logger.appendLine(JSON.stringify(message));
}

function popup(message)
{
	if (typeof message === 'string')
		vscode.window.showInformationMessage(message);
	else
		vscode.window.showInformationMessage(JSON.stringify(message));
}

function popupError(error)
{
	vscode.window.showErrorMessage(error.toString());
}

function updateConfigCache()
{
	config = vscode.workspace.getConfiguration().get('workspaceWizard');
}


//
// Extension Initialization
//

function activate(context)
{
	// Register tree data provider
	tree = new WorkspaceTreeDataProvider();
	vscode.window.registerTreeDataProvider('workspaceWizard', tree);
}

function deactivate()
{

}

module.exports = {
	activate,
	deactivate
}
