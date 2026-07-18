// api/directory.js
// Secure serverless backend: fetches ACTIVE member submissions from JotForm
// and returns a normalized member list for the WBB frontend directory widget.

const JOTFORM_FORM_ID = '242347443170149';
const JOTFORM_SUBMISSIONS_LIMIT = 1000;

// File-upload answers come back as an array (e.g. ["https://.../file.jpg"] or
// [] when nothing was uploaded). Jotform's upload URLs also require an
// authenticated request to resolve to the actual file, so route them through
// our own image proxy (api/image.js) which appends the API key server-side --
// the key must never be sent to the browser in a public <img src>.
function extractFileUrl(fileAnswer) {
  if (!Array.isArray(fileAnswer) || fileAnswer.length === 0) {
    return '';
  }
  const url = fileAnswer[0];
  if (!url) {
    return '';
  }
  return url.includes('jotform.com/uploads/')
    ? `/api/image?url=${encodeURIComponent(url)}`
    : url;
}

// Social fields are free text: sometimes a full URL, sometimes a bare handle.
// Pass full URLs through as-is; otherwise treat the value as a handle and
// build a platform link from it.
function buildSocialUrl(rawValue, platformBaseUrl) {
  if (!rawValue) {
    return '';
  }
  const trimmed = String(rawValue).trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return platformBaseUrl + encodeURIComponent(trimmed.replace(/^@/, ''));
}

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

        // "Business Owner" is a JotForm Full Name control, so the name comes
        // back as { first, last } sub-answers rather than a single string.
        const businessOwner = answersByLabel['business owner'] || {};
        const name = [businessOwner.first, businessOwner.last]
          .filter(Boolean)
          .join(' ')
          .trim();

        return {
          id: submission.id,
          dateCreated: submission.created_at,
          name,
          businessName: answersByLabel['business name'] || '',
          photo: extractFileUrl(answersByLabel['headshot']),
          businessLogo: extractFileUrl(answersByLabel['business logo']),
          instagram: buildSocialUrl(answersByLabel['instagram'], 'https://www.instagram.com/'),
          facebook: buildSocialUrl(answersByLabel['facebook'], 'https://www.facebook.com/'),
          twitter: buildSocialUrl(answersByLabel['x (twitter)'], 'https://x.com/'),
          tiktok: buildSocialUrl(answersByLabel['tiktok'], 'https://www.tiktok.com/@'),
          status: answersByLabel['status'] || 'Active'
        };
      })
      // Drop placeholder/test entries left over from building the form.
      .filter(submission => !/^textbox_sample/i.test(submission.businessName));

    // Group submissions by business name (case-insensitive), newest first, so
    // we can merge repeat submissions from the same member into one profile.
    // Business name is the more reliable identity key here since a member's
    // typed name can vary slightly between submissions (e.g. "Tim" vs.
    // "Timothy"), while their business name stays consistent.
    const submissionsByBusinessName = new Map();

    for (const submission of submissions) {
      const key = submission.businessName.toLowerCase().trim() || `__unnamed_${submission.id}`;
      if (!submissionsByBusinessName.has(key)) {
        submissionsByBusinessName.set(key, []);
      }
      submissionsByBusinessName.get(key).push(submission);
    }

    const mergedMembers = [];

    for (const memberSubmissions of submissionsByBusinessName.values()) {
      memberSubmissions.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

      const merged = { ...memberSubmissions[0] };

      for (const field of ['name', 'businessName', 'photo', 'businessLogo', 'instagram', 'facebook', 'twitter', 'tiktok', 'status']) {
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
