import { useImages, type ImageKind } from '../../data/images';

/** A portrait if Wikimedia has one, otherwise a monogram. */
export function Face({ kind, id, label, mono = '' }: { kind: ImageKind; id: string; label: string; mono?: string }) {
  const url = useImages(s => s[kind][id]);
  return url
    ? <img className="face" src={url} alt={label} draggable={false} />
    : <span className="face face-mono" aria-hidden="true">{mono}</span>;
}
