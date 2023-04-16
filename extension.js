const vscode = require('vscode');


//
// Constants
//

const KEY_WORKSPACES_FOLDER = 'workspacesFolder';
const KEY_EXPANDED_FOLDERS  = 'expandedFolders';


//
// Temporary Data
//

let config;
let context;
let iconSidebarFolderObj;
let iconSidebarWorkspaceObj;
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

				// Create icons
				if (config.sidebar.icon.folder)
					iconSidebarFolderObj = new vscode.ThemeIcon(config.sidebar.icon.folder);
				else
					iconSidebarFolderObj = undefined;
				if (config.sidebar.icon.workspace)
					iconSidebarWorkspaceObj = new vscode.ThemeIcon(config.sidebar.icon.workspace);
				else
					iconSidebarWorkspaceObj = undefined;
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
					if (/\.code-workspace$/.test(name)) {
						treeItems.push(new WorkspaceFileTreeItem(uri, name));
					}
				}
				// Folder
				else {
					treeItems.push(new FolderTreeItem(uri, name));
				}
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

class FolderTreeItem extends vscode.TreeItem
{
	constructor(uri, name)
	{
		super(
			name,
			config.sidebar.expandFolders
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.Collapsed
		);

		// TreeItem
		this.contextValue = 'folder';
		this.iconPath = iconSidebarFolderObj;

		// Custom
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}

class WorkspaceFileTreeItem extends vscode.TreeItem
{
	constructor(uri, name)
	{
		super(
			simplifyWorkspace(name),
			vscode.TreeItemCollapsibleState.None
		);

		// TreeItem
		this.command = {
			arguments: [this],
			command: 'workspaceWizard.open',
			title: 'Open workspace title',
			tooltip: 'Open workspace tooltip',
		};
		this.contextValue = 'workspace';
		this.iconPath = iconSidebarWorkspaceObj;

		// Custom
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}


//
// Quick Pick Items
//

class FolderQuickPickItem
{
	constructor(uri, name, icon)
	{
		// QuickPickItem
		this.label = `${icon}${name}`;
		this.description = 'Folder';

		// Custom
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}

class WorkspaceFileQuickPickItem
{
	constructor(uri, name, icon)
	{
		// QuickPickItem
		this.label = `${icon}${simplifyWorkspace(name)}`;
		this.description = 'Folder';
		// this.buttons: [], // TODO

		// Custom
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}


//
// Helper Functions
//

function configChanged(e) {
	if (e.affectsConfiguration('workspaceWizard.sidebar.watchForChanges'))
		startOrStopFileSystemWatcher();
}

const logger = vscode.window.createOutputChannel('Workspace Wizard');
function log(msg)
{
	logger.appendLine(popupToString(msg));
}

function popupInfo(msg)
{
	vscode.window.showInformationMessage(popupToString(msg));
}

function popupError(msg)
{
	vscode.window.showErrorMessage(popupToString(msg));
}

function popupToString(msg)
{
	try {
		return JSON.stringify(msg);
	} catch (err) {
		if (typeof msg === 'object')
			return `Object with keys: ${JSON.stringify(Object.keys(msg))}`;
		return `Error: toString failed for ${typeof msg} (${err.name})\n$${err.message}`;
	}
}

function refreshConfigCache(refreshIcons)
{
	config = vscode.workspace.getConfiguration().get('workspaceWizard');
}

function simplifyWorkspace(name)
{
	return name.slice(0, -15);
}

function startOrStopFileSystemWatcher()
{
	// If the user wants to watch for changes
	refreshConfigCache();
	if (config.sidebar.watchForChanges) {
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
		const ignoreCreate = false;
		const ignoreChange = true;
		const ignoreDelete = false;
		watcher = vscode.workspace.createFileSystemWatcher(
			globPattern, ignoreCreate, ignoreChange, ignoreDelete);
		watcher.onDidCreate(refreshWorkspacesSidebar);
		watcher.onDidDelete(refreshWorkspacesSidebar);
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
// Extension Commands Not in Command Palette
//

function openWorkspaceInCurrentWindow(item)
{
	vscode.commands.executeCommand('vscode.openFolder', item.uri, {forceNewWindow: false});
}

function openWorkspaceInNewWindow(item)
{
	vscode.commands.executeCommand('vscode.openFolder', item.uri, {forceNewWindow: true});
}

//
// Extension Commands in Command Palette
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
		refreshWorkspacesSidebar();
	}
}

function open(item)
{
	// Decide where to open
	refreshConfigCache();
	let openInNewWindow;
	if (item instanceof WorkspaceFileTreeItem)
		openInNewWindow = config.sidebar.openInNewWindow;
	else if (item)
		openInNewWindow = config.quickPick.openInNewWindow;

	// Open
	if (openInNewWindow)
		openWorkspaceInNewWindow(item);
	else
		openWorkspaceInCurrentWindow(item);
}

async function quickPickWorkspace(uri)
{
	// Get path of the workspaces folder
	const workspacesFolder = context.globalState.get(KEY_WORKSPACES_FOLDER);
	if (!uri) {
		if (!workspacesFolder)
			return popupInfo('Run the command "Select Workspaces Folder"');
		refreshConfigCache();
		uri = vscode.Uri.file(workspacesFolder);
	}

	// Icons
	const folderIcon = config.quickPick.icon.folder
		? `$(${config.quickPick.icon.folder}) `
		: '';
	const workspaceIcon = config.quickPick.icon.workspace
		? `$(${config.quickPick.icon.workspace}) `
		: '';

	// Add .. as the first quick pick item, if it's not the workspaces folder
	const quickPickItems = [];
	if (uri.fsPath !== workspacesFolder)
		quickPickItems.push(new FolderQuickPickItem(uri, '..', folderIcon));

	// Add other children of the folder as quick pick items
	try {
		const additionalFiles = await vscode.workspace.fs.readDirectory(uri);
		for (const [name, fileType] of additionalFiles) {
			// File
			if (fileType & vscode.FileType.File) {
				if (/\.code-workspace$/.test(name)) {
					quickPickItems.push(new WorkspaceFileQuickPickItem(uri, name, workspaceIcon));
				}
			}
			// Folder
			else {
				quickPickItems.push(new FolderQuickPickItem(uri, name, folderIcon));
			}
		}
	} catch (error) {
		popupError(`Unable to open ${uri.fsPath}`);
	}

	// Wait for the user
	const picked = await vscode.window.showQuickPick(quickPickItems, {title: 'Workspaces'});
	if (!picked)
		return;

	// Recursively display the folders
	if (picked instanceof FolderQuickPickItem)
		quickPickWorkspace(picked.uri);
	// Open the workspace
	else if (picked instanceof WorkspaceFileQuickPickItem)
		open(picked);
}

function refreshWorkspacesSidebar()
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
			'workspaceWizard.quickPickWorkspace',
			quickPickWorkspace
		),
		vscode.commands.registerCommand(
			'workspaceWizard.refreshWorkspacesSidebar',
			refreshWorkspacesSidebar
		),
		vscode.commands.registerCommand(
			'workspaceWizard.selectWorkspacesFolder',
			selectWorkspacesFolder
		),

		// Hidden commands
		vscode.commands.registerCommand(
			'workspaceWizard.open',
			open
		),
		// Hidden commands
		vscode.commands.registerCommand(
			'workspaceWizard.openWorkspaceInCurrentWindow',
			openWorkspaceInCurrentWindow
		),
		// Hidden commands
		vscode.commands.registerCommand(
			'workspaceWizard.openWorkspaceInNewWindow',
			openWorkspaceInNewWindow
		),
	);

	// Open the workspaces on startup
	const isExisting = vscode.workspace.name ? true : false;
	const startAction = isExisting ? config.general.startOnExistingWindow : config.general.startOnNewWindow;
	if (startAction === 'QuickPick')
		quickPickWorkspace();
	else if (startAction === 'Sidebar')
		vscode.commands.executeCommand('workbench.view.extension.workspaceWizard');

	// Watch file system for changes to the workspaces folder
	startOrStopFileSystemWatcher();
	vscode.workspace.onDidChangeConfiguration(configChanged);
}

function deactivate()
{

}

module.exports = {
	activate,
	deactivate
}


// TODO

// Add quick pick button for alternative action (open in current/new window)

// Implement expandFolders to support the new options

// Prepend 'Workspace Wizard: ' to all commands in the command palette
