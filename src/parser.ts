export abstract class Parser {
	protected abstract onWrongTag(tagMatch: RegExpExecArray): void;
	protected abstract onMatchingTags(text: string, startMatch: RegExpExecArray, endMatch: RegExpExecArray): void;

	private onUnknownTagPair(text: string, startMatch: RegExpExecArray, endMatch: RegExpExecArray): void {
		const startName = startMatch[1];
		const endName = endMatch[1];

		if (startName === endName) {
			this.onMatchingTags(text, startMatch, endMatch);
		} else {
			this.onWrongTag(startMatch);
			this.onWrongTag(endMatch);
		}
	}

	parse(text: string): void {
		const snippetStartRegex: RegExp = /<snippet:([!#%&/()=?`'|\\*+a-zA+Z0-9-]+)>/g;
		const snippetEndRegex: RegExp = /<\/snippet:([!#%&/()=?`'|\\*+a-zA+Z0-9-]+)>/g;

		let startMatch: RegExpExecArray | null = snippetStartRegex.exec(text);
		
		while (true) {
			let endMatch: RegExpExecArray | null;

			while (true) {
				endMatch = snippetEndRegex.exec(text);

				if (endMatch) {
					if (!startMatch || startMatch.index > endMatch.index) {
						// There is no start or start is after end, it means wrong end
						this.onWrongTag(endMatch);
					} else {
						// There is start and it's before end
						break;
					}
				} else {
					if (startMatch) {
						// There no end, but there is start... just consume all starts and return
						do {
							this.onWrongTag(startMatch);
						} while ((startMatch = snippetStartRegex.exec(text)));
					}

					// At this point there is no end tag and all start tags are consumed
					return;
				}
			}

			// There is a start and it's before the end
			// What about next start?
			let nextStartMatch: RegExpExecArray | null;
			
			while ((nextStartMatch = snippetStartRegex.exec(text))) {
				if (nextStartMatch.index < endMatch.index) {
					this.onWrongTag(startMatch);
					startMatch = nextStartMatch;
				} else {
					break;
				}
			}

			this.onUnknownTagPair(text, startMatch, endMatch);

			if (nextStartMatch) {
				// There is a next start and it is after end
				startMatch = nextStartMatch;
			} else {
				// There is no next start match.... it means this is the last start
				// How about more end tags?
				// Because there is no start, we can just mark all of them as wrong ones
				while ((endMatch = snippetEndRegex.exec(text))) {
					this.onWrongTag(endMatch);
				}

				return;
			}
		}
	}
}
