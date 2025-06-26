import { POST } from '../route';
import { sql } from '@vercel/postgres';
import getPasscodeByName from '../../../passcodes/getPasscodeByName';

// Mock Request if not available (for Node.js test environment)
if (typeof Request === 'undefined') {
    global.Request = class Request {
        constructor(url, options = {}) {
            this.url = url;
            this.method = options.method || 'GET';
            this.headers = options.headers || {};
            this._body = options.body;
        }
        
        async json() {
            return JSON.parse(this._body);
        }
    };
}

jest.mock('@vercel/postgres');
jest.mock('../../../passcodes/getPasscodeByName');

describe('/api/admin/export', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getPasscodeByName.mockResolvedValue('test_admin_password');
    });

    it('should return 401 for invalid password', async () => {
        const request = new Request('http://localhost/api/admin/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'wrong_password' })
        });

        const response = await POST(request);
        
        expect(response.status).toBe(401);
        expect(response.data.error).toBe('Unauthorized');
    });

    it('should export data successfully with correct password', async () => {
        const mockActivities = [
            { id: 1, title: 'Test Activity', description: 'Test Description', sortIndex: 0, scheduleIndex: null, createdAt: new Date(), updatedAt: new Date() }
        ];
        const mockComments = [
            { id: 1, activityId: 1, message: 'Test Comment', createdAt: new Date(), updatedAt: new Date() }
        ];

        sql.mockImplementationOnce(() => Promise.resolve({ rows: mockActivities }));
        sql.mockImplementationOnce(() => Promise.resolve({ rows: mockComments }));

        const request = new Request('http://localhost/api/admin/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'test_admin_password' })
        });

        const response = await POST(request);
        
        expect(response.status).toBeUndefined(); // Success responses don't have status in mock
        expect(response.data.success).toBe(true);
        expect(response.data.exportData.activities).toEqual(mockActivities);
        expect(response.data.exportData.comments).toEqual(mockComments);
        expect(response.data.sqlDump).toContain('INSERT INTO activities');
        expect(response.data.sqlDump).toContain('INSERT INTO comments');
    });

    it('should handle database errors gracefully', async () => {
        sql.mockImplementationOnce(() => Promise.reject(new Error('Database connection failed')));

        const request = new Request('http://localhost/api/admin/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'test_admin_password' })
        });

        const response = await POST(request);
        
        expect(response.status).toBe(500);
        expect(response.data.error).toBe('Failed to export database');
    });
});
