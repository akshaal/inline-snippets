import { ProviderResult, CompletionItem, CompletionItemKind, window, SnippetString } from 'vscode';
import { TextDocument, ExtensionContext, languages, CompletionItemProvider } from 'vscode';

function createCompletionItem(name: string, body: string): CompletionItem {
	const item = new CompletionItem(name, CompletionItemKind.Snippet);
	item.insertText = new SnippetString(body);
	return item;
}

abstract class Parser {
	protected abstract onWrongTag(): void;

	private onUnknownPair(): void {
		// TODO
	}

	parse(text: string): void {
		const snippetStartRegex: RegExp = /<snippet:([a-zA+Z0-9-]+)>/g;
		const snippetEndRegex: RegExp = /<\/snippet:([a-zA+Z0-9-]+)>/g;

		let startMatch: RegExpExecArray | null = snippetStartRegex.exec(text);
		
		while (true) {
			let endMatch: RegExpExecArray | null;

			while (true) {
				endMatch = snippetEndRegex.exec(text);

				if (endMatch) {
					if (!startMatch || startMatch.index > endMatch.index) {
						// There is no start or start is after end, it means wrong end
						this.onWrongTag();
					} else {
						// There is start and it's before end
						break;
					}
				} else {
					if (startMatch) {
						// There no end, but there is start... just consume all starts and return
						do {
							this.onWrongTag();
						} while ((startMatch = snippetStartRegex.exec(text)));
					}

					// At this point there is no end tag and all start tags are consumed
					return
				}
			}

			// There is a start and it's before the end
			// What about next start?
			let nextStartMatch: RegExpExecArray | null;
			
			while ((nextStartMatch = snippetStartRegex.exec(text))) {
				if (nextStartMatch.index < endMatch.index) {
					this.onWrongTag();
				} else {
					break;
				}
			}

			this.onUnknownPair();

			if (nextStartMatch) {
				// There is a next and it is after 
				startMatch = nextStartMatch;
			} else {
				// There is no next start match.... it means this is the last start
				// How about more end tags?
				// Because there is no start, we can just mark all of them as wrong ones
				while ((endMatch = snippetEndRegex.exec(text))) {
					this.onWrongTag();
				}

				return
			}
		}
	}
}

class CompletionCollectingParser extends Parser {
	completions: CompletionItem[] = [];

	protected onWrongTag(): void {

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
