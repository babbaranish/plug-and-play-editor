import { Editor } from '../core/Editor';

export interface Plugin {
    name: string;
    init(editor: Editor): void;
}
