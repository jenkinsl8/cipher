import { normalizeAiResumePayload } from '../aiResumeParser';

describe('normalizeAiResumePayload', () => {
  it('normalizes profile fields and de-duplicates skills', () => {
    const result = normalizeAiResumePayload({
      profile: {
        name: 'Alex Doe',
        currentRole: 'Product Manager',
        location: 'New York, NY',
      },
      skills: ['SQL', 'sql', '  Leadership  ', ''],
      warnings: ['Check formatting', ''],
    });

    expect(result.profile.name).toBe('Alex Doe');
    expect(result.profile.currentRole).toBe('Product Manager');
    expect(result.profile.location).toBe('New York, NY');
    expect(result.skills.length).toBe(2);
    expect(result.warnings).toEqual(['Check formatting']);
  });
});
