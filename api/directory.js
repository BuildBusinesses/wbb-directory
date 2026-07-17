// api/directory.js
// Secure serverless backend: fetches ACTIVE member submissions from JotForm
// and returns a normalized member list for the WBB frontend directory widget.

const JOTFORM_FORM_ID = '242347443170149';
const JOTFORM_SUBMISSIONS_LIMIT = 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  try {
    const jotformApiKey = process.env.JOTFORM_API_KEY;
    const jotformSubmissionsUrl =
      `https://api.jotform.com/form/${JOTFORM_FORM_ID}/submissions` +
      `?apiKey=${jotformApiKey}&limit=${JOTFORM_SUBMISSIONS_LIMIT}`;

    const jotformResponse = await fetch(jotformSubmissionsUrl);

    if (!jotformResponse.ok) {
      res.status(jotformResponse.status).json({ error: 'Jotform API error' });
      return;
    }

    const jotformData = await jotformResponse.json();

    const submissions = jotformData.content
      .filter(submission => submission.status === 'ACTIVE')
      .map(submission => {
        const submissionAnswers = submission.answers;
        const answersByLabel = {};

        for (const answerKey in submissionAnswers) {
          const answer = submissionAnswers[answerKey];
          if (answer.text) {
            answersByLabel[answer.text.toLowerCase().trim()] = answer.answer;
          }
        }

        return {
          id: submission.id,
          dateCreated: submission.created_at,
          name: answersByLabel['name'] || '',
          businessName: answersByLabel['business name'] || '',
          photo: answersByLabel['photo'] || '',
          status: answersByLabel['status'] || 'Active'
        };
      });

    // Group submissions by member name (case-insensitive), newest first, so we
    // can merge repeat submissions from the same member into one profile.
    const submissionsByName = new Map();

    for (const submission of submissions) {
      const key = submission.name.toLowerCase().trim() || `__unnamed_${submission.id}`;
      if (!submissionsByName.has(key)) {
        submissionsByName.set(key, []);
      }
      submissionsByName.get(key).push(submission);
    }

    const mergedMembers = [];

    for (const memberSubmissions of submissionsByName.values()) {
      memberSubmissions.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

      const merged = { ...memberSubmissions[0] };

      for (const field of ['name', 'businessName', 'photo', 'status']) {
        if (!merged[field]) {
          const fallback = memberSubmissions.find(submission => submission[field]);
          if (fallback) {
            merged[field] = fallback[field];
          }
        }
      }

      mergedMembers.push(merged);
    }

    const activeMembers = mergedMembers.filter(
      member => member.status.toLowerCase().trim() === 'active'
    );

    res.status(200).json(activeMembers);

  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
