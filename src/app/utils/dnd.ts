/**
 * The one drag vocabulary the library and the sidebar share.
 *
 * Everything draggable in the app describes itself as a {@link DragPayload}
 * carried on a private MIME type, and every drop target resolves that payload
 * back to tracks through {@link tracksForPayload}. Two consequences are the
 * point of doing it this way:
 *
 * 1. A drop target never has to know *what* was dragged. "Add these tracks to
 *    this playlist" is one code path whether the user dragged three rows, a
 *    folder or an album card.
 * 2. Nothing but ids travels in the DataTransfer. A payload is a reference to
 *    library state, resolved at drop time, so a drag that outlives a rescan
 *    lands on the tracks that exist *now* rather than on a stale snapshot.
 *
 * `dragover` cannot read the transfer's data — only its `types` — which is why
 * {@link hasDragPayload} exists separately from {@link readDragPayload}.
 */
import type { BucketGrouping, Track } from '../contexts'
import { bucketKey } from './grouping'


/** Private to this app; a foreign drag never carries it. */
export const DND_MIME = 'application/x-desktop-audio'

/** Selected rows. Ids rather than tracks — see the module docstring. */
export interface TracksDrag {
  readonly kind:     'tracks'
  readonly trackIds: readonly string[]
  readonly label:    string
}

/** A folder from the sidebar tree or from the table's folder rows. */
export interface FolderDrag {
  readonly kind:  'folder'
  readonly path:  string
  readonly label: string
}

/** An album or artist bucket — a grid card, or a group heading in the table. */
export interface GroupDrag {
  readonly kind:     'group'
  readonly grouping: BucketGrouping
  readonly key:      string
  readonly label:    string
}

/** A playlist being moved between folders. Carries no tracks of its own. */
export interface PlaylistDrag {
  readonly kind:  'playlist'
  readonly id:    string
  readonly label: string
}

/** A playlist *folder* being refiled under another one. */
export interface PlaylistFolderDrag {
  readonly kind:  'playlist-folder'
  readonly id:    string
  readonly label: string
}

export type DragPayload =
  | TracksDrag |
  FolderDrag |
  GroupDrag |
  PlaylistDrag |
  PlaylistFolderDrag

/** The payload kinds that resolve to tracks, and so can join a playlist. */
export type MediaDrag = TracksDrag | FolderDrag | GroupDrag

export function isMediaDrag (payload: DragPayload): payload is MediaDrag {
  return payload.kind !== 'playlist' && payload.kind !== 'playlist-folder'
}

/**
 * Write `payload` onto a drag.
 *
 * A `text/plain` copy rides along so dropping into a text field outside the
 * app produces the item's name rather than nothing at all.
 */
export function setDragPayload (transfer: DataTransfer, payload: DragPayload): void {
  transfer.setData(DND_MIME, JSON.stringify(payload))
  transfer.setData('text/plain', payload.label)
  transfer.effectAllowed = isMediaDrag(payload) ? 'copy' : 'move'
}

/** True when this drag is one of ours — the only question `dragover` can ask. */
export function hasDragPayload (transfer: Pick<DataTransfer, 'types'>): boolean {
  return Array.from(transfer.types).includes(DND_MIME)
}

/** The payload, or `null` for a foreign drag or a malformed one. */
export function readDragPayload (transfer: Pick<DataTransfer, 'getData'>): DragPayload | null {
  const raw = transfer.getData(DND_MIME)
  if (!raw)
    return null

  try {
    const parsed = JSON.parse(raw) as DragPayload
    return parsed && typeof parsed.kind === 'string' ? parsed : null
  }
  catch {
    return null
  }
}

/**
 * Separator-insensitive comparison, because the two sides genuinely differ:
 * the scanner reports native paths while the sidebar tree builds its own with
 * `/`, so on Windows a literal prefix test matches nothing at all.
 */
function withinFolder (path: string, folder: string): boolean {
  const file = path.replace(/\\/g, '/')
  const dir  = folder.replace(/\\/g, '/').replace(/\/$/, '')
  return file === dir || file.startsWith(`${dir}/`)
}

/**
 * The tracks `payload` stands for, in `tracks` order.
 *
 * Folder drags match by path prefix rather than by exact parent, so dropping a
 * folder brings its subfolders' tracks with it — which is what dragging a
 * folder onto a playlist visibly promises.
 *
 * Generic in the track type so the caller gets back what it passed in: the
 * library holds model instances, and narrowing them to the serialized shape
 * here would strip the behaviour off every track that survives the filter.
 */
export function tracksForPayload<T extends Track> (
  payload: DragPayload,
  tracks: readonly T[]
): readonly T[] {
  switch (payload.kind) {
    case 'tracks': {
      const wanted = new Set(payload.trackIds)
      return tracks.filter(track =>
        wanted.has(track.id))
    }
    case 'folder':
      return tracks.filter(track =>
        withinFolder(track.path, payload.path))
    case 'group':
      return tracks.filter(track =>
        bucketKey(track, payload.grouping) === payload.key)
    default:
      return []
  }
}
