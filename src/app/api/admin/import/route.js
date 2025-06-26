import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import getPasscodeByName from '../../passcodes/getPasscodeByName';

export async function POST(request) {
    try {
        const { password, importData, clearExisting } = await request.json();
        
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

        if (!importData || !importData.activities) {
            return NextResponse.json(
                { error: 'Invalid import data format' },
                { status: 400 }
            );
        }

        let importedActivities = 0;
        let importedComments = 0;

        // Clear existing data if requested
        if (clearExisting) {
            await sql`DELETE FROM comments`;
            await sql`DELETE FROM activities`;
            await sql`ALTER SEQUENCE activities_id_seq RESTART WITH 1`;
            await sql`ALTER SEQUENCE comments_id_seq RESTART WITH 1`;
        }

        // Import activities
        if (importData.activities && importData.activities.length > 0) {
            for (const activity of importData.activities) {
                await sql`
                    INSERT INTO activities (title, description, "sortIndex", "scheduleIndex")
                    VALUES (${activity.title}, ${activity.description}, ${activity.sortIndex}, ${activity.scheduleIndex})
                `;
                importedActivities++;
            }
        }

        // Import comments
        if (importData.comments && importData.comments.length > 0) {
            // Get activity ID mapping for comments
            const activitiesResult = await sql`SELECT * FROM activities ORDER BY id`;
            const activityMapping = {};
            
            // Create a mapping based on title and description to match activities
            activitiesResult.rows.forEach((activity, index) => {
                const originalActivity = importData.activities[index];
                if (originalActivity) {
                    activityMapping[originalActivity.id] = activity.id;
                }
            });

            for (const comment of importData.comments) {
                const newActivityId = activityMapping[comment.activityId];
                if (newActivityId) {
                    await sql`
                        INSERT INTO comments ("activityId", message)
                        VALUES (${newActivityId}, ${comment.message})
                    `;
                    importedComments++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Data imported successfully',
            imported: {
                activities: importedActivities,
                comments: importedComments
            },
            clearedExisting: clearExisting
        });

    } catch (error) {
        console.error('Database import error:', error);
        return NextResponse.json(
            { error: 'Failed to import database', details: error.message },
            { status: 500 }
        );
    }
}
