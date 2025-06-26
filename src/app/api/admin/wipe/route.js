import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import getPasscodeByName from '../../passcodes/getPasscodeByName';

export async function POST(request) {
    try {
        const { password } = await request.json();
        
        // Check admin password from database
        let ADMIN_PASSWORD;
        try {
            ADMIN_PASSWORD = await getPasscodeByName('admin');
        } catch (error) {
            console.error('Failed to get admin passcode:', error);
            return NextResponse.json(
                { error: 'Admin passcode not configured' },
                { status: 500 }
            );
        }
        
        if (password !== ADMIN_PASSWORD) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get all data before wiping for the snapshot
        const activitiesResult = await sql`SELECT * FROM activities ORDER BY id`;
        const commentsResult = await sql`SELECT * FROM comments ORDER BY id`;
        
        // Create a snapshot with timestamp
        const timestamp = new Date().toISOString();
        const snapshot = {
            exportDate: timestamp,
            activities: activitiesResult.rows,
            comments: commentsResult.rows,
            totalActivities: activitiesResult.rows.length,
            totalComments: commentsResult.rows.length
        };

        // Generate SQL dump
        let sqlDump = `-- Kite Festival App Database Dump\n-- Export Date: ${timestamp}\n\n`;
        
        // Activities table dump
        sqlDump += `-- Activities Table (${activitiesResult.rows.length} records)\n`;
        if (activitiesResult.rows.length > 0) {
            sqlDump += `INSERT INTO activities (id, title, description, "sortIndex", "scheduleIndex", "createdAt", "updatedAt") VALUES\n`;
            const activityValues = activitiesResult.rows.map(row => {
                const createdAt = row.createdAt ? `'${row.createdAt.toISOString()}'` : 'NULL';
                const updatedAt = row.updatedAt ? `'${row.updatedAt.toISOString()}'` : 'NULL';
                return `(${row.id}, ${row.title ? `'${row.title.replace(/'/g, "''")}'` : 'NULL'}, ${row.description ? `'${row.description.replace(/'/g, "''")}'` : 'NULL'}, ${row.sortIndex || 'NULL'}, ${row.scheduleIndex || 'NULL'}, ${createdAt}, ${updatedAt})`;
            }).join(',\n');
            sqlDump += activityValues + ';\n\n';
        }

        // Comments table dump
        sqlDump += `-- Comments Table (${commentsResult.rows.length} records)\n`;
        if (commentsResult.rows.length > 0) {
            sqlDump += `INSERT INTO comments (id, "activityId", message, "createdAt", "updatedAt") VALUES\n`;
            const commentValues = commentsResult.rows.map(row => {
                const createdAt = row.createdAt ? `'${row.createdAt.toISOString()}'` : 'NULL';
                const updatedAt = row.updatedAt ? `'${row.updatedAt.toISOString()}'` : 'NULL';
                return `(${row.id}, ${row.activityId}, ${row.message ? `'${row.message.replace(/'/g, "''")}'` : 'NULL'}, ${createdAt}, ${updatedAt})`;
            }).join(',\n');
            sqlDump += commentValues + ';\n\n';
        }

        // Now wipe the database
        await sql`DELETE FROM comments`;
        await sql`DELETE FROM activities`;
        
        // Reset sequences
        await sql`ALTER SEQUENCE activities_id_seq RESTART WITH 1`;
        await sql`ALTER SEQUENCE comments_id_seq RESTART WITH 1`;

        return NextResponse.json({
            success: true,
            message: 'Database wiped successfully',
            snapshot,
            sqlDump,
            wiped: {
                activities: activitiesResult.rows.length,
                comments: commentsResult.rows.length
            }
        });

    } catch (error) {
        console.error('Database wipe error:', error);
        return NextResponse.json(
            { error: 'Failed to wipe database', details: error.message },
            { status: 500 }
        );
    }
}
