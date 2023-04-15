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
let watcher;


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
				if (!workspacesFolder) {
					popupInfo('Run the command "Select Workspaces Folder"');
					return resolve([]);
				}
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
			config.sidebar.expandFolders
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

function toString(msg)
{
	try {
		return JSON.stringify(msg);
	} catch (err) {
		return err ? err.toString() : 'Error: toString failed';
	}
}

const logger = vscode.window.createOutputChannel('Workspace Wizard');
function log(msg)
{
	logger.appendLine(toString(msg));
}

function popupInfo(msg)
{
	vscode.window.showInformationMessage(toString(msg));
}

function popupError(msg)
{
	vscode.window.showErrorMessage(toString(msg));
}

function refreshConfigCache()
{
	config = vscode.workspace.getConfiguration().get('workspaceWizard');
}

function startOrStopFileSystemWatcher()
{
	// TODO: Don't forget to start/stop this after activation if config is changed
	// (workspaceWizard.general.watchForChanges)

	// If the user wants to watch for changes
	if (config.general.watchForChanges) {
		// Skip if it's already been started
		if (watcher !== undefined)
			return;

		// Skip if there is no workspace folder
		const workspacesFolder = context.globalState.get(KEY_WORKSPACES_FOLDER);
		if (!workspacesFolder)
			return;

		// Start watching
		const uri = vscode.Uri.file(workspacesFolder);
		const globPattern = new vscode.RelativePattern(uri, '**/*');
		watcher = vscode.workspace.createFileSystemWatcher(globPattern);
		// TODO make these things work
		watcher.onDidChange((uri) => { log(`changed ${uri}`); });
		watcher.onDidCreate((uri) => { log(`created ${uri}`); });
		watcher.onDidDelete((uri) => { log(`deleted ${uri}`); });
	}
	// If the user wants to watch for changes
	else {
		// Skip if it's already been stopped
		if (watcher === undefined)
			return;

		// Stop watching
		watcher.dispose();
		watcher = undefined;
	}
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

	// Remember the workspaces folder, start/stop watcher, and refresh the tree
	if (uris && uris.length) {
		await context.globalState.update(KEY_WORKSPACES_FOLDER, uris[0].fsPath);
		startOrStopFileSystemWatcher();
		tree.refresh();
	}
}

function open(item)
{
	// Decide where to open
	refreshConfigCache();
	let defaultOpenAction;
	if (false) // TODO quick pick
		defaultOpenAction = config.quickPick.defaultOpenAction;
	else if (item instanceof WorkspaceFileTreeItem)
		defaultOpenAction = config.sidebar.defaultOpenAction;

	// Open
	if (defaultOpenAction === 'Open in Current Window')
		openWorkspaceInCurrentWindow(item);
	else if (defaultOpenAction === 'Open in New Window')
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

	// Open the workspaces on startup
	const isExisting = vscode.workspace.name ? true : false;
	const startAction = isExisting ? config.general.startOnExistingWindow : config.general.startOnNewWindow;
	if (startAction === 'QuickPick')
		popupInfo('TODO OPEN QUICK PICK');
	else if (startAction === 'Sidebar')
		vscode.commands.executeCommand('workbench.view.extension.workspaceWizard');

	// Watch file system for changes to the workspaces folder
	startOrStopFileSystemWatcher();
}

function deactivate()
{

}

module.exports = {
	activate,
	deactivate
}


// TODO

// Fix the problem where focus is lost when first loading
// workbench.action.focusSideBar

// Implement a quick pick menu

// Implement showFolders

// Automatically refresh if the user wants a file system watcher
