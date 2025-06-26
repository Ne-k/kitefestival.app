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

describe('/api/admin/import', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getPasscodeByName.mockResolvedValue('test_admin_password');
    });

    it('should return 401 for invalid password', async () => {
        const request = new Request('http://localhost/api/admin/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'wrong_password', importData: {} })
        });

        const response = await POST(request);
        
        expect(response.status).toBe(401);
        expect(response.data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid import data', async () => {
        const request = new Request('http://localhost/api/admin/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'test_admin_password', importData: {} })
        });

        const response = await POST(request);
        
        expect(response.status).toBe(400);
        expect(response.data.error).toBe('Invalid import data format');
    });

    it('should import data successfully', async () => {
        const importData = {
            activities: [
                { id: 1, title: 'Test Activity', description: 'Test Description', sortIndex: 0, scheduleIndex: null }
            ],
            comments: [
                { id: 1, activityId: 1, message: 'Test Comment' }
            ]
        };

        // Set up mocks in the order they'll be called:
        // 1. Import activities (one INSERT for each activity)
        sql.mockImplementationOnce(() => Promise.resolve({ rowCount: 1 }));
        
        // 2. SELECT activities for comment mapping
        sql.mockImplementationOnce(() => Promise.resolve({ 
            rows: [{ id: 10, title: 'Test Activity', description: 'Test Description' }] 
        }));
        
        // 3. Import comments (one INSERT for each comment)
        sql.mockImplementationOnce(() => Promise.resolve({ rowCount: 1 }));

        const request = new Request('http://localhost/api/admin/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                password: 'test_admin_password', 
                importData, 
                clearExisting: false 
            })
        });

        const response = await POST(request);
        
        expect(response.status).toBeUndefined(); // Success responses don't have status in mock
        expect(response.data.success).toBe(true);
        expect(response.data.message).toBe('Data imported successfully');
        expect(response.data.imported.activities).toBe(1);
        expect(response.data.imported.comments).toBe(1);
    });

    it('should clear existing data when requested', async () => {
        const importData = {
            activities: [
                { id: 1, title: 'Test Activity', description: 'Test Description', sortIndex: 0, scheduleIndex: null }
            ],
            comments: []
        };

        // Mock DELETE, ALTER SEQUENCE, and INSERT queries
        sql.mockImplementation(() => Promise.resolve({ rowCount: 1 }));

        const request = new Request('http://localhost/api/admin/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                password: 'test_admin_password', 
                importData, 
                clearExisting: true 
            })
        });

        const response = await POST(request);
        
        expect(response.status).toBeUndefined(); // Success responses don't have status in mock
        expect(response.data.success).toBe(true);
        expect(response.data.clearedExisting).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
        const importData = {
            activities: [
                { id: 1, title: 'Test Activity', description: 'Test Description', sortIndex: 0, scheduleIndex: null }
            ],
            comments: []
        };

        sql.mockImplementationOnce(() => Promise.reject(new Error('Database connection failed')));

        const request = new Request('http://localhost/api/admin/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                password: 'test_admin_password', 
                importData, 
                clearExisting: false 
            })
        });

        const response = await POST(request);
        
        expect(response.status).toBe(500);
        expect(response.data.error).toBe('Failed to import database');
    });
});
