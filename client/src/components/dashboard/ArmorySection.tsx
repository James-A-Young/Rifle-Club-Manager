import FirearmForm from '../FirearmForm';
import { Firearm } from '../../types/club';
import { useState } from 'react';

interface FirearmData {
  make: string;
  model: string;
  caliber: string;
  serialNumber: string;
}

interface Props {
  title?: string;
  addButtonLabel?: string;
  emptyMessage?: string;
  firearms: Firearm[];
  showForm: boolean;
  onToggleForm: () => void;
  onAdd: (data: FirearmData) => Promise<void>;
  onEdit: (firearmId: string, data: FirearmData) => Promise<void>;
  onRemove: (firearmId: string) => Promise<void>;
  onToggleFavorite: (firearmId: string, isFavorite: boolean) => Promise<void>;
}

export default function ArmorySection({
  title = 'Club Armory',
  addButtonLabel = 'Add Firearm',
  emptyMessage = 'No firearms registered',
  firearms,
  showForm,
  onToggleForm,
  onAdd,
  onEdit,
  onRemove,
  onToggleFavorite,
}: Props) {
  const [editingFirearmId, setEditingFirearmId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<FirearmData>({ make: '', model: '', caliber: '', serialNumber: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [removingFirearmId, setRemovingFirearmId] = useState<string | null>(null);
  const [updatingFavoriteFirearmId, setUpdatingFavoriteFirearmId] = useState<string | null>(null);
  const [tableError, setTableError] = useState('');

  function startEditing(firearm: Firearm) {
    setTableError('');
    setEditingFirearmId(firearm.id);
    setEditingForm({
      make: firearm.make,
      model: firearm.model,
      caliber: firearm.caliber,
      serialNumber: firearm.serialNumber,
    });
  }

  function cancelEditing() {
    setEditingFirearmId(null);
    setSavingEdit(false);
    setTableError('');
  }

  async function saveEdit() {
    if (!editingFirearmId) return;
    setSavingEdit(true);
    setTableError('');
    try {
      await onEdit(editingFirearmId, editingForm);
      setEditingFirearmId(null);
    } catch (err) {
      setTableError(err instanceof Error ? err.message : 'Failed to update firearm');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRemove(firearmId: string) {
    setTableError('');
    setRemovingFirearmId(firearmId);
    try {
      await onRemove(firearmId);
    } catch (err) {
      setTableError(err instanceof Error ? err.message : 'Failed to remove firearm');
    } finally {
      setRemovingFirearmId(null);
    }
  }

  async function handleToggleFavorite(firearm: Firearm) {
    setTableError('');
    setUpdatingFavoriteFirearmId(firearm.id);
    try {
      await onToggleFavorite(firearm.id, !Boolean(firearm.isFavorite));
    } catch (err) {
      setTableError(err instanceof Error ? err.message : 'Failed to update favorite');
    } finally {
      setUpdatingFavoriteFirearmId(null);
    }
  }

  return (
    <section>
      <div className="page-header">
        <h2>{title}</h2>
        <button className="btn btn-primary btn-sm" onClick={onToggleForm}>
          {addButtonLabel}
        </button>
      </div>
      {showForm && (
        <div style={{ marginBottom: '1rem' }}>
          <FirearmForm onSubmit={onAdd} onCancel={onToggleForm} />
        </div>
      )}
      {tableError && <div className="alert alert-error">{tableError}</div>}
      <table>
        <thead>
          <tr>
            <th>Favorite</th>
            <th>Make</th>
            <th>Model</th>
            <th>Caliber</th>
            <th>Serial</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {firearms.map(f => (
            <tr key={f.id}>
              {editingFirearmId === f.id ? (
                <>
                  <td>{Boolean(f.isFavorite) ? 'Yes' : 'No'}</td>
                  <td>
                    <input
                      value={editingForm.make}
                      onChange={e => setEditingForm(prev => ({ ...prev, make: e.target.value }))}
                      required
                    />
                  </td>
                  <td>
                    <input
                      value={editingForm.model}
                      onChange={e => setEditingForm(prev => ({ ...prev, model: e.target.value }))}
                      required
                    />
                  </td>
                  <td>
                    <input
                      value={editingForm.caliber}
                      onChange={e => setEditingForm(prev => ({ ...prev, caliber: e.target.value }))}
                      required
                    />
                  </td>
                  <td>
                    <input
                      value={editingForm.serialNumber}
                      onChange={e => setEditingForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                      required
                    />
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-primary btn-sm" onClick={() => void saveEdit()} disabled={savingEdit}>
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={cancelEditing} disabled={savingEdit}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td>{Boolean(f.isFavorite) ? 'Yes' : 'No'}</td>
                  <td>{f.make}</td>
                  <td>{f.model}</td>
                  <td>{f.caliber}</td>
                  <td>{f.serialNumber}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleToggleFavorite(f)}
                        disabled={updatingFavoriteFirearmId === f.id}
                      >
                        {updatingFavoriteFirearmId === f.id
                          ? 'Saving…'
                          : (Boolean(f.isFavorite) ? 'Unfavorite' : 'Favorite')}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditing(f)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => void handleRemove(f.id)}
                        disabled={removingFirearmId === f.id}
                      >
                        {removingFirearmId === f.id ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
          {firearms.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
