# Podcast Requests Feature Setup

## Overview

The landing page now includes:
1. **Lenny's Podcast Button** - Click to start chatting with Lenny's podcast guests
2. **YouTube Request Widget** - Users can request other YouTube podcasts to be converted

## Database Setup

### Run the Migration

Execute the SQL migration to create the `podcast_requests` table:

```bash
# Option 1: Using Supabase CLI
supabase db push migrations/create_podcast_requests_table.sql

# Option 2: Using Supabase Dashboard
# 1. Go to your Supabase project dashboard
# 2. Navigate to SQL Editor
# 3. Copy and paste the contents of migrations/create_podcast_requests_table.sql
# 4. Execute the query
```

### Table Schema

The `podcast_requests` table includes:
- `id` - Primary key
- `youtube_url` - The requested YouTube URL
- `status` - Request status (pending, processing, completed, rejected)
- `created_at` - Timestamp when request was created
- `updated_at` - Timestamp when request was last updated
- `processed_at` - Timestamp when request was processed
- `notes` - Optional notes about the request

## API Endpoint

### POST `/podcast-request`

Submit a YouTube podcast conversion request.

**Request Body:**
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Request submitted successfully"
}
```

**Validation:**
- URL must be from `youtube.com` or `youtu.be`
- Malicious patterns are blocked (javascript:, data:, etc.)
- Duplicate prevention (optional - can be enabled via unique index)

## Frontend Flow

1. **Landing Page** shows:
   - Lenny's Podcast button (image)
   - YouTube request widget

2. **Clicking Lenny's Podcast** → Goes to user info form → Chat interface

3. **Submitting YouTube Request** → Validates URL → Saves to Supabase → Shows success message

## Security Features

- YouTube URL validation (only youtube.com/youtu.be domains)
- Malicious pattern detection
- SQL injection prevention (using parameterized queries)
- Row Level Security (RLS) policies for data access

## Next Steps

1. Run the migration to create the table
2. Test the endpoint: `POST http://localhost:8000/podcast-request`
3. Check Supabase dashboard to see submitted requests
4. Process requests manually or set up automated processing

