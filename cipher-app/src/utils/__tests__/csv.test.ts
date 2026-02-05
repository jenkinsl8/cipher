import { parseLinkedInConnections } from '../csv';

describe('parseLinkedInConnections', () => {
  it('parses LinkedIn CSV rows into connection objects', () => {
    const csv = `First Name,Last Name,Email Address,Company,Position,Connected On,Location
Alex,Smith,alex@example.com,Acme,Product Manager,1/1/2024,"New York, NY"
"Jamie","Doe","jamie@example.com","Data Co","Director, Analytics","2/2/2024","San Francisco, CA"`;

    const connections = parseLinkedInConnections(csv);
    expect(connections).toHaveLength(2);
    expect(connections[0]).toMatchObject({
      firstName: 'Alex',
      lastName: 'Smith',
      email: 'alex@example.com',
      company: 'Acme',
      position: 'Product Manager',
    });
    expect(connections[1].position).toBe('Director, Analytics');
    expect(connections[1].location).toBe('San Francisco, CA');
  });
});
