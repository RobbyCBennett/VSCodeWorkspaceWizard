'use strict';


const vscode = require('vscode');


//
// Constants
//

const ICON_NEW_WINDOW_OBJ     = new vscode.ThemeIcon('empty-window');
const ICON_CURRENT_WINDOW_OBJ = new vscode.ThemeIcon('window');

const ICON_DEFAULT_FOLDER_OBJ    = new vscode.ThemeIcon('folder');
const ICON_DEFAULT_WORKSPACE_OBJ = new vscode.ThemeIcon('folder-library');

const KEY_EXPANDED_FOLDERS  = 'expandedFolders';
const KEY_WORKSPACES_FOLDER = 'workspacesFolder';

const QUICK_PICK_ITEM_ACTION_FOLDER    = false;
const QUICK_PICK_ITEM_ACTION_WORKSPACE = true;

const QUICK_SELECT_BUTTON_ACTION_NEW_FOLDER    = false;
const QUICK_SELECT_BUTTON_ACTION_NEW_WORKSPACE = true;

const RE_WORKSPACE = /\.code-workspace$/;


//
// Temporary Data
//


let config;
let context;
let expandedFolders;
let iconQuickPickFolderObj;
let iconQuickPickWorkspaceObj;
let iconSidebarFolderObj;
let iconSidebarWorkspaceObj;
let quickPick;
let treeDataProvider;
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
					popupInfoSelectWorkspacesFolder();
					return resolve([]);
				}
				uri = vscode.Uri.file(workspacesFolder);

				createSidebarConfigurableIcons();
			}
			// Get path of a sub-folder
			else
				uri = treeItem.uri;

			// Create tree items for files
			const treeItems = [];
			for (const [name, fileType] of await readDirectory(uri)) {
				// File
				if (fileType & vscode.FileType.File) {
					if (RE_WORKSPACE.test(name))
						treeItems.push(new WorkspaceFileTreeItem(uri, name));
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
		uri = vscode.Uri.joinPath(uri, name);

		// Collapsed
		let collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		if (config.sidebar.expandFolders === 'All Folders')
			collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		else if (config.sidebar.expandFolders === 'Expanded Last Time' && expandedFolders.has(uri.fsPath))
			collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

		// TreeItem
		super(
			name,
			collapsibleState,
		);
		this.contextValue = 'folder';
		this.iconPath = iconSidebarFolderObj;

		// Custom
		this.uri = uri;
	}
}

class WorkspaceFileTreeItem extends vscode.TreeItem
{
	constructor(uri, name)
	{
		uri = vscode.Uri.joinPath(uri, name);

		// TreeItem
		super(
			simplifyWorkspace(name),
			vscode.TreeItemCollapsibleState.None
		);
		this.command = {
			arguments: [{
				uri: uri,
				isWorkspaceFileTreeItem: true,
			}],
			command: 'workspaceWizard._openWorkspace',
			title: 'Open workspace title',
			tooltip: 'Open workspace tooltip',
		};
		this.contextValue = 'workspace';
		this.iconPath = iconSidebarWorkspaceObj;

		// Custom
		this.uri = uri;
	}
}


//
// Quick Pick Items
//

class OpenQuickInputButton
{
	constructor()
	{
		if (config.quickPick.openInNewWindow) {
			this.iconPath = ICON_CURRENT_WINDOW_OBJ;
			this.tooltip = 'Open Workspace in Current Window';
		}
		else {
			this.iconPath = ICON_NEW_WINDOW_OBJ;
			this.tooltip = 'Open Workspace in New Window';
		}
	}
}

class FolderQuickPickItem
{
	constructor(uri, name, icon)
	{
		// QuickPickItem
		this.label = `${iconIdToIconInLabel(icon)}${name}`;
		this.description = 'Folder';

		// Custom
		this.action = QUICK_PICK_ITEM_ACTION_FOLDER;
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}

class WorkspaceFileQuickPickItem
{
	constructor(uri, name, icon)
	{
		// QuickPickItem
		this.label = `${iconIdToIconInLabel(icon)}${simplifyWorkspace(name)}`;
		this.description = 'Workspace';
		this.buttons = [new OpenQuickInputButton()];

		// Custom
		this.action = QUICK_PICK_ITEM_ACTION_WORKSPACE;
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}

class NewFolderQuickInputButton
{
	constructor(uri)
	{
		// QuickInputButton
		this.tooltip = 'New Folder';
		this.iconPath = iconQuickPickFolderObj;

		// Custom
		this.action = QUICK_SELECT_BUTTON_ACTION_NEW_FOLDER;
		this.uri = uri;
	}
}

class NewWorkspaceFileQuickInputButton
{
	constructor(uri)
	{
		// QuickInputButton
		this.tooltip = 'New Workspace';
		this.iconPath = iconQuickPickWorkspaceObj;

		// Custom
		this.action = QUICK_SELECT_BUTTON_ACTION_NEW_WORKSPACE;
		this.uri = uri;
	}
}


//
// Helper Functions
//

async function readDirectory(uri)
{
	let files;
	try {
		files = await vscode.workspace.fs.readDirectory(uri);
	} catch (error) {
		popupErrorUnableToOpen(uri);
		return [];
	}

	files.sort(function(fileA, fileB) {
		const a = fileA[0].replace(RE_WORKSPACE, '');
		const b = fileB[0].replace(RE_WORKSPACE, '');
		if (a > b)
			return 1;
		else if (a < b)
			return -1;
		else
			return 0;
	});

	return files;
}

function iconIdToIconInLabel(string)
{
	return string ? `$(${string}) ` : string;
}

function createQuickPickConfigurableIcons()
{
	if (config.quickPick.icon.folder)
		iconQuickPickFolderObj = new vscode.ThemeIcon(config.quickPick.icon.folder);
	else
		iconQuickPickFolderObj = ICON_DEFAULT_FOLDER_OBJ;
	if (config.quickPick.icon.workspace)
		iconQuickPickWorkspaceObj = new vscode.ThemeIcon(config.quickPick.icon.workspace);
	else
		iconQuickPickWorkspaceObj = ICON_DEFAULT_WORKSPACE_OBJ;
}

function createSidebarConfigurableIcons()
{
	if (config.sidebar.icon.folder)
		iconSidebarFolderObj = new vscode.ThemeIcon(config.sidebar.icon.folder);
	else
		iconSidebarFolderObj = undefined;
	if (config.sidebar.icon.workspace)
		iconSidebarWorkspaceObj = new vscode.ThemeIcon(config.sidebar.icon.workspace);
	else
		iconSidebarWorkspaceObj = undefined;
}

function configChanged(e) {
	if (e.affectsConfiguration('workspaceWizard.sidebar.watchForChanges'))
		startOrStopFileSystemWatcher();
}

function popupErrorUnableToOpen(uri)
{
	vscode.window.showErrorMessage(`Unable to open ${uri.fsPath}`);
}

function popupInfoSelectWorkspacesFolder()
{
	vscode.window.showInformationMessage('Run the command \'Select Workspaces Folder\'');
}

function refreshConfigCache(refreshIcons)
{
	config = vscode.workspace.getConfiguration().get('workspaceWizard');
}

function saveExpandedFolders()
{
	const values = [];
	for (const value of expandedFolders)
		values.push(value);
	context.globalState.update(KEY_EXPANDED_FOLDERS, values);
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
		title: 'Select folder where all .code-workspace files will be',
	});

	// Remember the workspaces folder, start/stop watcher, and refresh the tree
	if (uris && uris.length) {
		await context.globalState.update(KEY_WORKSPACES_FOLDER, uris[0].fsPath);
		startOrStopFileSystemWatcher();
		refreshWorkspacesSidebar();
	}
}

function openWorkspace(item)
{
	// Decide between new window and current window
	refreshConfigCache();
	let openInNewWindow;
	if (item.isWorkspaceFileTreeItem === true)
		openInNewWindow = config.sidebar.openInNewWindow;
	else if (item)
		openInNewWindow = config.quickPick.openInNewWindow;

	// Open
	if (openInNewWindow)
		openWorkspaceInNewWindow(item);
	else
		openWorkspaceInCurrentWindow(item);
}

async function newFolder(uri)
{
	// Make example URI
	const name = 'NEW_FOLDER';
	uri = vscode.Uri.joinPath(uri, name);

	// Get select range
	const selectStart = uri.fsPath.length - name.length;
	const selectEnd = uri.fsPath.length;

	// Get URI by user input
	const path = await vscode.window.showInputBox({
		placeHolder: uri.fsPath,
		prompt: 'New folder to group workspaces',
		title: 'New Folder',
		value: uri.fsPath,
		valueSelection: [selectStart, selectEnd],
	});
	uri = vscode.Uri.file(path);

	// Create the folder
	await vscode.workspace.fs.createDirectory(uri);
}

async function newWorkspace(uri)
{
	// Make sure workspaceFolders isn't undefined
	const workspaceFolders = vscode.workspace.workspaceFolders || [];

	// Make example URI
	const name = (workspaceFolders.length) ? workspaceFolders[0].name : 'workspace';
	const ext = '.code-workspace';
	uri = vscode.Uri.joinPath(uri, `${name}${ext}`);

	// Get select range
	const selectStart = uri.fsPath.length - ext.length - name.length;
	const selectEnd = uri.fsPath.length - ext.length;

	// Get URI by user input
	const path = await vscode.window.showInputBox({
		placeHolder: uri.fsPath,
		prompt: 'New workspace',
		title: 'New Workspace',
		value: uri.fsPath,
		valueSelection: [selectStart, selectEnd],
	});
	uri = vscode.Uri.file(path);

	// Create the content of the workspace file
	const workspace = { folders: [] };
	for (const workspaceFolder of workspaceFolders)
		workspace.folders.push({ path: workspaceFolder.uri.fsPath });

	// Create the workspace file
	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.createFile(uri, {
		contents: Buffer.from(JSON.stringify(workspace, null, '\t')),
	});
	const created = await vscode.workspace.applyEdit(workspaceEdit);

	// Open the newly created workspace
	vscode.commands.executeCommand('vscode.openFolder', uri, {forceNewWindow: false});
}

async function quickPickWorkspace(uri, startup)
{
	// Stop if already searching filesystem to avoid duplication
	if (quickPick && quickPick.busy)
		return;

	// Get path of the workspaces folder
	const workspacesFolder = context.globalState.get(KEY_WORKSPACES_FOLDER);

	// If there is no current workspace/folder
	if (!uri) {
		// Stop if starting up and editing an existing file
		if (startup && vscode.window.activeTextEditor && !vscode.window.activeTextEditor.document.isUntitled)
			return;
		// Stop if there is no workspaces folder
		if (!workspacesFolder)
			return popupInfoSelectWorkspacesFolder();
		// Initialize the first uri
		refreshConfigCache();
		uri = vscode.Uri.file(workspacesFolder);
	}

	// Initialize quick pick
	if (!quickPick) {
		quickPick = vscode.window.createQuickPick();
		quickPick.title = 'Workspaces';
		quickPick.buttons = [];
		quickPick.onDidChangeSelection(function(quickPickItems) {
			if (quickPickItems.length === 0)
				return;
			const quickPickItem = quickPickItems[0];
			switch (quickPickItem.action) {
				case QUICK_PICK_ITEM_ACTION_FOLDER:
					quickPickWorkspace(quickPickItem.uri, false);
					break;
				case QUICK_PICK_ITEM_ACTION_WORKSPACE:
					openWorkspace(quickPickItem);
					break;
			}
		});
		quickPick.onDidHide(function() {
			quickPick.dispose();
			quickPick = undefined;
		});
		quickPick.onDidTriggerItemButton(function(e) {
			if (config.quickPick.openInNewWindow)
				openWorkspaceInCurrentWindow(e.item);
			else
				openWorkspaceInNewWindow(e.item);
		});
		quickPick.onDidTriggerButton(async function(button) {
			switch (button.action) {
				case QUICK_SELECT_BUTTON_ACTION_NEW_FOLDER:
					await newFolder(button.uri);
					quickPickWorkspace(button.uri, false);
					break;
				case QUICK_SELECT_BUTTON_ACTION_NEW_WORKSPACE:
					newWorkspace(button.uri);
					break;
				case undefined: // Back
					quickPickWorkspace(quickPick.items[0].uri, false);
					break;
			}
		});
	}

	// Clear the filter text value and the folder/workspace items
	quickPick.value = '';
	quickPick.items = [];

	// Get the icons
	const folderIcon = config.quickPick.icon.folder;
	const workspaceIcon = config.quickPick.icon.workspace;
	createQuickPickConfigurableIcons();

	// Add new folder and new workspace buttons
	quickPick.buttons = [
		new NewFolderQuickInputButton(uri),
		new NewWorkspaceFileQuickInputButton(uri),
	];

	// If in a sub-folder, add back button and .. button
	if (uri.fsPath !== workspacesFolder) {
		quickPick.buttons.push(vscode.QuickInputButtons.Back);
		quickPick.buttons = quickPick.buttons;
		quickPick.items.push(new FolderQuickPickItem(uri, '..', folderIcon));
	}

	// Show as empty with the loading indicator
	quickPick.busy = true;
	quickPick.show();

	// Add other children of the folder as quick pick items
	for (const [name, fileType] of await readDirectory(uri)) {
		// File
		if (fileType & vscode.FileType.File) {
			if (RE_WORKSPACE.test(name))
				quickPick.items.push(new WorkspaceFileQuickPickItem(uri, name, workspaceIcon));
		}
		// Folder
		else {
			quickPick.items.push(new FolderQuickPickItem(uri, name, folderIcon));
		}
	}

	// Show the items and remove the loading indicator
	quickPick.items = quickPick.items;
	quickPick.busy = false;
}

function refreshWorkspacesSidebar()
{
	treeDataProvider.refresh();
}


//
// Extension Initialization
//

function activate(_context)
{
	// Temporary data
	context = _context;
	treeDataProvider = new WorkspaceTreeDataProvider();
	refreshConfigCache();

	// Register
	context.subscriptions.push(
		// Tree data provider
		vscode.window.registerTreeDataProvider('workspaceWizard', treeDataProvider),

		// Commands
		vscode.commands.registerCommand(
			'workspaceWizard._openWorkspace',
			openWorkspace
		),
		vscode.commands.registerCommand(
			'workspaceWizard._openWorkspaceInCurrentWindow',
			openWorkspaceInCurrentWindow
		),
		vscode.commands.registerCommand(
			'workspaceWizard._openWorkspaceInNewWindow',
			openWorkspaceInNewWindow
		),
		vscode.commands.registerCommand(
			'workspaceWizard.quickPickWorkspace',
			quickPickWorkspace
		),
		vscode.commands.registerCommand(
			'workspaceWizard.refreshWorkspacesSidebar',
			refreshWorkspacesSidebar
		),
		vscode.commands.registerCommand(
			'workspaceWizard._refreshWorkspacesSidebar',
			refreshWorkspacesSidebar
		),
		vscode.commands.registerCommand(
			'workspaceWizard.selectWorkspacesFolder',
			selectWorkspacesFolder
		),
		vscode.commands.registerCommand(
			'workspaceWizard._selectWorkspacesFolder',
			selectWorkspacesFolder
		),
	);

	// Tree view
	const treeView = vscode.window.createTreeView(
		'workspaceWizard',
		{ treeDataProvider: treeDataProvider }
	);

	// Open the workspaces on startup
	const isExisting = vscode.workspace.name ? true : false;
	const startAction = isExisting ? config.general.startOnExistingWindow : config.general.startOnNewWindow;
	if (startAction === 'QuickPick')
		quickPickWorkspace(null, true);
	else if (startAction === 'Sidebar')
		vscode.commands.executeCommand('workbench.view.extension.workspaceWizard');

	// Get tree view collapse/expand status from storage
	expandedFolders = new Set(context.globalState.get(KEY_EXPANDED_FOLDERS) || []);

	// Save tree view collapse/expand changes to storage
	treeView.onDidCollapseElement(function(e) {
		if (expandedFolders.has(e.element.uri.fsPath)) {
			expandedFolders.delete(e.element.uri.fsPath);
			saveExpandedFolders();
		}
	});
	treeView.onDidExpandElement(function(e) {
		if (!expandedFolders.has(e.element.uri.fsPath)) {
			expandedFolders.add(e.element.uri.fsPath);
			saveExpandedFolders();
		}
	});

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
