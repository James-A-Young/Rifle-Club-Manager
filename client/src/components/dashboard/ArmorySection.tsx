import FirearmForm from '../FirearmForm';
import { Firearm } from '../../types/club';

interface FirearmData {
  make: string;
  model: string;
  caliber: string;
  serialNumber: string;
}

interface Props {
  firearms: Firearm[];
  showForm: boolean;
  onToggleForm: () => void;
  onAdd: (data: FirearmData) => Promise<void>;
  onRemove: (firearmId: string) => void;
}

export default function ArmorySection({ firearms, showForm, onToggleForm, onAdd, onRemove }: Props) {
  return (
    <section>
      <div className="page-header">
        <h2>Club Armory</h2>
        <button className="btn btn-primary btn-sm" onClick={onToggleForm}>
          Add Firearm
        </button>
      </div>
      {showForm && (
        <div style={{ marginBottom: '1rem' }}>
          <FirearmForm onSubmit={onAdd} onCancel={onToggleForm} />
        </div>
      )}
      <table>
        <thead>
          <tr>
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
              <td>{f.make}</td>
              <td>{f.model}</td>
              <td>{f.caliber}</td>
              <td>{f.serialNumber}</td>
              <td>
                <button className="btn btn-danger btn-sm" onClick={() => onRemove(f.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {firearms.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                No firearms registered
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
