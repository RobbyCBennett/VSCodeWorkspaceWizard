const vscode = require('vscode');


//
// Persistent Data
//

const KEY_WORKSPACES_FOLDER = 'workspacesFolder';


//
// Temporary Data
//

let config;
let context;
let tree;


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
			// Get path of the workspaces folder
			if (!treeItem) {
				const workspacesFolder = context.globalState.get(KEY_WORKSPACES_FOLDER);
				if (!workspacesFolder)
					return resolve([]);
				uri = vscode.Uri.file(workspacesFolder);
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
		refreshConfigCache();
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
	command;
	contextValue;
	uri;

	constructor(uri, name)
	{
		super(
			name.slice(0, -15),
			vscode.TreeItemCollapsibleState.None
		);
		this.command = {
			arguments: [this],
			command: 'workspaceWizard.open',
			title: 'Open workspace title',
			tooltip: 'Open workspace tooltip',
		};
		this.contextValue = 'workspace'
		this.uri = vscode.Uri.joinPath(uri, name);
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

function refreshConfigCache()
{
	config = vscode.workspace.getConfiguration().get('workspaceWizard');
}


//
// Extension Commands
//

async function selectWorkspacesFolder()
{
	// Get the workspaces folder from user input
	const uris = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		openLabel: 'Select',
		title: 'Select folder with .code-workspace files',
	});

	// Remember the workspaces folder and refresh the tree
	if (uris && uris.length) {
		await context.globalState.update(KEY_WORKSPACES_FOLDER, uris[0].fsPath);
		tree.refresh();
	}
}

function open(item)
{
	// Decide where to open
	refreshConfigCache();
	let defaultOpenAction;
	if (item instanceof WorkspaceFileTreeItem)
		defaultOpenAction = config.sidebar.defaultOpenAction;
	else if (false)
		defaultOpenAction = config.quickPick.defaultOpenAction;
	else
		return popupError('No Workspace to open');

	// Open
	if (defaultOpenAction === 'Open Current')
		openWorkspaceInCurrentWindow(item);
	else if (defaultOpenAction === 'Open New')
		openWorkspaceInNewWindow(item);
}

function openWorkspaceInCurrentWindow(item)
{
	vscode.commands.executeCommand('vscode.openFolder', item.uri, false);
}

function openWorkspaceInNewWindow(item)
{
	vscode.commands.executeCommand('vscode.openFolder', item.uri, true);
}

function refresh()
{
	tree.refresh();
}


//
// Extension Initialization
//

function activate(_context)
{
	// Temporary data
	context = _context;
	tree = new WorkspaceTreeDataProvider();
	refreshConfigCache();

	// Register
	context.subscriptions.push(
		// Tree data provider
		vscode.window.registerTreeDataProvider('workspaceWizard', tree),

		// Commands
		vscode.commands.registerCommand(
			'workspaceWizard.selectWorkspacesFolder',
			selectWorkspacesFolder
		),
		vscode.commands.registerCommand(
			'workspaceWizard.open',
			open
		),
		vscode.commands.registerCommand(
			'workspaceWizard.refresh',
			refresh
		),
	);
}

function deactivate()
{

}

module.exports = {
	activate,
	deactivate
}
