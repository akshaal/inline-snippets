import { ProviderResult, CompletionItem, CompletionItemKind, window, SnippetString } from 'vscode';
import { TextDocument, ExtensionContext, languages, CompletionItemProvider } from 'vscode';
import { Parser } from './parser';

function createCompletionItem(name: string, body: string): CompletionItem {
	const item = new CompletionItem(name, CompletionItemKind.Snippet);
	item.insertText = new SnippetString(body);
	return item;
}

class CompletionCollectingParser extends Parser {
	completions: CompletionItem[] = [];

	protected onWrongTag(tagMatch: RegExpExecArray): void {

	}

	protected onMatchingTags(startMatch: RegExpExecArray, endMatch: RegExpExecArray): void {

	}
}

class CompletionItemProviderImpl implements CompletionItemProvider {
	provideCompletionItems(document: TextDocument): ProviderResult<CompletionItem[]> {
		const parser = new CompletionCollectingParser();
		parser.parse(document.getText());
		return parser.completions;
	}
}

// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	const impl = new CompletionItemProviderImpl();

	context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "untitled" }, impl));
	context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "file" }, impl));
}

// this method is called when your extension is deactivated
export function deactivate() { }
