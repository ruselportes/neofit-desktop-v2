import { rateTable } from '../rates';

export default function RatesView() {
  const rates = rateTable;

  return (
    <>
      <header className="header">
        <div className="header-title">
          <h2>Gym Rates</h2>
          <p>Current pricing for memberships and walk-ins.</p>
        </div>
      </header>

      <div className="table-container">
        <table className="table-rates">
          <thead>
            <tr>
              <th>Category</th>
              <th>Type</th>
              <th>Monthly</th>
              <th>Semi-Monthly</th>
              <th>Daily</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r, index) => (
              <tr key={index}>
                <td><strong>{r.category}</strong></td>
                <td>{r.type}</td>
                <td>₱{r.monthly}</td>
                <td>₱{r.semi}</td>
                <td>₱{r.daily}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stat-card" style={{ marginTop: '2rem', padding: '1.5rem' }}>
        <h3 className="section-title">Additional Fees</h3>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>
          Annual Membership Fee: <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>₱300</span>
        </p>
      </div>
    </>
  );
}
