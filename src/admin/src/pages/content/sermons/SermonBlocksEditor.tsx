/**
 * Sermon rich-body editor (improvement B3, docs/09 §22–§27).
 *
 * A section editor for the closed block set the public site can render. It
 * never accepts HTML: every control produces structured values, and the same
 * `sermon-blocks` helpers validate the result before the page saves it.
 */
import { useId, useState } from 'react';
import {
  emptySermonBlock,
  moveSermonBlock,
  SERMON_BLOCK_TYPES,
  updateSermonBlock,
  type SermonBlock,
  type SermonBlockType,
} from '../../../lib/sermon-blocks';

interface SermonBlocksEditorProps {
  blocks: readonly SermonBlock[];
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (blocks: SermonBlock[]) => void;
}

function blockLabel(type: SermonBlockType): string {
  return SERMON_BLOCK_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

export function SermonBlocksEditor({
  blocks,
  errors,
  disabled,
  onChange,
}: SermonBlocksEditorProps) {
  const id = useId();
  const [newType, setNewType] = useState<SermonBlockType>('paragraph');

  function replace(index: number, next: SermonBlock) {
    onChange(updateSermonBlock(blocks, index, next));
  }

  return (
    <section className="form-section" aria-labelledby={`${id}-title`}>
      <div className="form-section__head">
        <h2 className="form-section__title" id={`${id}-title`}>
          Contenido del mensaje
        </h2>
        <p className="form-section__hint">
          Bloques estructurados que se publican en el detalle del sermón. No se
          admite HTML arbitrario.
        </p>
      </div>

      {blocks.length === 0 ? (
        <p className="field__help">
          Sin contenido por bloques. Podés seguir usando la descripción y las
          notas, o agregar secciones acá.
        </p>
      ) : null}

      <ol className="blocks-editor">
        {blocks.map((block, index) => {
          const error = errors[String(index)];
          const errorId = `${id}-block-${index}-error`;
          return (
            <li className="blocks-editor__item" key={`${block.type}-${index}`}>
              <div className="blocks-editor__head">
                <span className="blocks-editor__type">
                  {index + 1}. {blockLabel(block.type)}
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => onChange(moveSermonBlock(blocks, index, -1))}
                    disabled={disabled || index === 0}
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => onChange(moveSermonBlock(blocks, index, 1))}
                    disabled={disabled || index === blocks.length - 1}
                  >
                    Bajar
                  </button>
                  <button
                    type="button"
                    className="button button--danger button--small"
                    onClick={() =>
                      onChange(blocks.filter((_, position) => position !== index))
                    }
                    disabled={disabled}
                  >
                    Quitar
                  </button>
                </div>
              </div>

              {block.type === 'heading' ? (
                <div className="form-grid">
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-heading-${index}`}>
                      Texto del título
                    </label>
                    <input
                      id={`${id}-heading-${index}`}
                      className="field__input"
                      type="text"
                      value={block.text}
                      onChange={(event) =>
                        replace(index, { ...block, text: event.target.value })
                      }
                      disabled={disabled}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-level-${index}`}>
                      Nivel
                    </label>
                    <select
                      id={`${id}-level-${index}`}
                      className="field__input"
                      value={block.level}
                      onChange={(event) =>
                        replace(index, {
                          ...block,
                          level: event.target.value === '3' ? 3 : 2,
                        })
                      }
                      disabled={disabled}
                    >
                      <option value="2">Título de sección (H2)</option>
                      <option value="3">Subtítulo (H3)</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {block.type === 'paragraph' ? (
                <div className="field">
                  <label className="field__label" htmlFor={`${id}-paragraph-${index}`}>
                    Texto
                  </label>
                  <textarea
                    id={`${id}-paragraph-${index}`}
                    className="field__input field__textarea"
                    rows={4}
                    value={block.text}
                    onChange={(event) =>
                      replace(index, { ...block, text: event.target.value })
                    }
                    disabled={disabled}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                  />
                </div>
              ) : null}

              {block.type === 'list' ? (
                <>
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-list-${index}`}>
                      Ítems (uno por línea)
                    </label>
                    <textarea
                      id={`${id}-list-${index}`}
                      className="field__input field__textarea"
                      rows={4}
                      value={block.items.join('\n')}
                      onChange={(event) =>
                        replace(index, {
                          ...block,
                          items: event.target.value.split('\n'),
                        })
                      }
                      disabled={disabled}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </div>
                  <div className="field field--checkbox">
                    <input
                      id={`${id}-ordered-${index}`}
                      type="checkbox"
                      checked={block.ordered}
                      onChange={(event) =>
                        replace(index, { ...block, ordered: event.target.checked })
                      }
                      disabled={disabled}
                    />
                    <label htmlFor={`${id}-ordered-${index}`}>
                      Lista numerada
                    </label>
                  </div>
                </>
              ) : null}

              {block.type === 'quote' ? (
                <div className="form-grid">
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-quote-${index}`}>
                      Cita
                    </label>
                    <textarea
                      id={`${id}-quote-${index}`}
                      className="field__input field__textarea"
                      rows={3}
                      value={block.text}
                      onChange={(event) =>
                        replace(index, { ...block, text: event.target.value })
                      }
                      disabled={disabled}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-cite-${index}`}>
                      Referencia (opcional)
                    </label>
                    <input
                      id={`${id}-cite-${index}`}
                      className="field__input"
                      type="text"
                      value={block.cite}
                      onChange={(event) =>
                        replace(index, { ...block, cite: event.target.value })
                      }
                      disabled={disabled}
                    />
                  </div>
                </div>
              ) : null}

              {block.type === 'cta' ? (
                <div className="form-grid">
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-cta-label-${index}`}>
                      Texto del botón
                    </label>
                    <input
                      id={`${id}-cta-label-${index}`}
                      className="field__input"
                      type="text"
                      value={block.label}
                      onChange={(event) =>
                        replace(index, { ...block, label: event.target.value })
                      }
                      disabled={disabled}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-cta-href-${index}`}>
                      Destino
                    </label>
                    <input
                      id={`${id}-cta-href-${index}`}
                      className="field__input field__input--mono"
                      type="text"
                      value={block.href}
                      onChange={(event) =>
                        replace(index, { ...block, href: event.target.value })
                      }
                      placeholder="/soy-nuevo"
                      disabled={disabled}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </div>
                </div>
              ) : null}

              {block.type === 'image' ? (
                <div className="form-grid">
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-image-src-${index}`}>
                      Origen de la imagen
                    </label>
                    <input
                      id={`${id}-image-src-${index}`}
                      className="field__input field__input--mono"
                      type="text"
                      value={block.src}
                      onChange={(event) =>
                        replace(index, { ...block, src: event.target.value })
                      }
                      placeholder="/media/imagen.jpg"
                      disabled={disabled}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-image-alt-${index}`}>
                      Texto alternativo
                    </label>
                    <input
                      id={`${id}-image-alt-${index}`}
                      className="field__input"
                      type="text"
                      value={block.alt}
                      onChange={(event) =>
                        replace(index, { ...block, alt: event.target.value })
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${id}-image-caption-${index}`}>
                      Pie de foto (opcional)
                    </label>
                    <input
                      id={`${id}-image-caption-${index}`}
                      className="field__input"
                      type="text"
                      value={block.caption}
                      onChange={(event) =>
                        replace(index, { ...block, caption: event.target.value })
                      }
                      disabled={disabled}
                    />
                  </div>
                </div>
              ) : null}

              {error ? (
                <p className="field__error" id={errorId} role="alert">
                  {error}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="blocks-editor__add">
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor={`${id}-new-type`}>
            Tipo de bloque
          </label>
          <select
            id={`${id}-new-type`}
            className="field__input"
            value={newType}
            onChange={(event) => setNewType(event.target.value as SermonBlockType)}
            disabled={disabled}
          >
            {SERMON_BLOCK_TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => onChange([...blocks, emptySermonBlock(newType)])}
          disabled={disabled}
        >
          Agregar bloque
        </button>
      </div>
    </section>
  );
}
