import { Model } from './Model'

export class FolderEntry extends Model {
  private _name!: string
  private _path!: string
  private _children: FolderEntry[] = []
  private _expanded!: boolean

  get name(): string { return this._name }
  set name(v: string) { if (this._name !== v) { this._name = v; this.markDirty() } }

  get path(): string { return this._path }
  set path(v: string) { if (this._path !== v) { this._path = v; this.markDirty() } }

  get children(): FolderEntry[] { return this._children }
  set children(v: FolderEntry[]) { this._children = v; this.markDirty() }

  get expanded(): boolean { return this._expanded }
  set expanded(v: boolean) { if (this._expanded !== v) { this._expanded = v; this.markDirty() } }

  static fromFolderNode(node: { id: string; name: string; path: string; children: readonly FolderEntry[]; expanded: boolean }): FolderEntry {
    const entry = new FolderEntry(node.id)
    entry._name = node.name
    entry._path = node.path
    entry._children = [...node.children]
    entry._expanded = node.expanded
    return entry
  }
}
