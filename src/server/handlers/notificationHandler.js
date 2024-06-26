const { google } = require('googleapis')
const moment = require('moment');
const { GoogleUser } = require('../models/googleUserModel');
const { GoogleFile } = require('../models/googleFileModel');
const { Subscription } = require('../models/subscriptionModel');
const Bot = require('ringcentral-chatbot-core/dist/models/Bot').default;
const { checkAndRefreshAccessToken } = require('../lib/oauth');
const cardBuilder = require('../lib/cardBuilder');

const NEW_EVENT_TIME_THRESHOLD_IN_SECONDS = 30

function isEventNew(dateTime1, dateTime2) {
    const timeDiff = moment(dateTime1).diff(dateTime2, 'seconds');
    console.log(`Time Diff: ${dateTime1} and ${dateTime2} : ${timeDiff}`);
    return timeDiff < NEW_EVENT_TIME_THRESHOLD_IN_SECONDS && timeDiff >= 0;
}

async function notification(req, res) {
    try {
        console.log('Incoming notification:');
        console.log(req.headers);
        res.send('OK');
        return;
        // Identify which user or subscription is relevant, normally by 3rd party webhook id or user id. 
        const googleSubscriptionId = req.headers['x-goog-channel-id'];
        const googleUser = await GoogleUser.findOne({
            where: {
                googleSubscriptionId
            }
        });
        if (!googleUser) {
            res.status(403);
            res.send('Unknown googleSubscriptionId');
            return;
        }
        await checkAndRefreshAccessToken(googleUser);
        await onReceiveNotification(googleUser);
    } catch (e) {
        console.error(e);
    }

    res.status(200);
    res.json({
        result: 'OK',
    });
}
async function onReceiveNotification(googleUser) {
    const drive = google.drive({ version: 'v3', headers: { Authorization: `Bearer ${googleUser.accessToken}` } });

    const listResponse = await drive.changes.list({ pageToken: googleUser.startPageToken });
    console.log(`List Response: ${JSON.stringify(listResponse.data)}`);
    // IF: reaching the end of this page, refresh startPageToken
    if (listResponse.data.newStartPageToken) {
        await GoogleUser.update(
            {
                startPageToken: listResponse.data.newStartPageToken
            },
            {
                where: {
                    id: googleUser.id
                }
            }
        )
    }

    const bot = await Bot.findByPk(googleUser.botId);
    const latestChanges = listResponse.data.changes.filter(change => change.type === 'file');
    console.log(`Latest changes: ${JSON.stringify(latestChanges, null, 2)}`)
    for (const change of latestChanges) {
        const fileId = change.fileId;
        const fileResponse = await drive.files.get({ fileId, fields: 'id,name,webViewLink,iconLink,owners,viewedByMe,sharedWithMeTime,modifiedTime,ownedByMe,mimeType,sharingUser,capabilities', supportsAllDrives: true })
        const fileData = fileResponse.data;
        const googleFile = await GoogleFile.findByPk(fileId);

        // If file name is changed, update that in db
        if (googleFile && fileData.name != googleFile.name) {
            await GoogleFile.update(
                {
                    name: fileData.name
                },
                {
                    where:
                    {
                        id: fileId
                    }
                }
            )
        }

        console.log(`OwnByMe: ${fileData.ownedByMe}\nIsReceiveNewFile: ${googleUser.isReceiveNewFile}\n SharedWithMeTime: ${fileData.sharedWithMeTime}`);
        // Case: New File Share With Me
        if (!fileData.ownedByMe && googleUser.isReceiveNewFile && fileData.sharedWithMeTime && isEventNew(change.time, fileData.sharedWithMeTime)) {
            console.log('===========NEW FILE============');
            console.log('drive.files.get:', JSON.stringify(fileData, null, 2))
            const owner = fileData.owners[0];
            const sharingUser = fileData.sharingUser;
            const accessibilityVerb = getVerbFromCapabilitiesRole(fileData.capabilities);
            const cardData = {
                userAvatar: sharingUser.photoLink ?? "https://fonts.gstatic.com/s/i/productlogos/drive_2020q4/v8/web-64dp/logo_drive_2020q4_color_2x_web_64dp.png",
                username: sharingUser.displayName ?? "Someone",
                userEmail: sharingUser.emailAddress ?? "",
                fileIconUrl: fileData.iconLink,
                fileName: fileData.name,
                fileUrl: fileData.webViewLink,
                fileType: getFileTypeFromMimeType(fileData.mimeType),
                ownerEmail: owner.emailAddress,
                ownerDisplayName: owner.displayName,
                modifiedTime: fileData.modifiedTime,
                accessibilityVerb
            };
            const card = cardBuilder.newFileShareCard(cardData);
            // Send adaptive card to your channel in RingCentral App
            await bot.sendAdaptiveCard(googleUser.rcDMGroupId, card);
        }
        // Case: New Comment
        else {
            const subscriptions = await Subscription.findAll({
                where: {
                    fileId,
                    googleUserId: googleUser.id
                }
            })
            // Ignore file if there's no subscription
            if (subscriptions.length === 0) {
                continue;
            }

            // Send to all channels that subscribe to this file
            for (const subscription of subscriptions) {
                const commentResponse = await drive.comments.list({ fileId, pageSize: 1, fields: '*' });
                const commentData = commentResponse.data.comments[0];
                if (!commentData) {
                    continue;
                }
                // NewComment = Comment with no Reply
                const isNewComment = commentData.replies == null || commentData.replies.length === 0;
                console.log('drive.comments.get:', JSON.stringify(commentData, null, 2));
                console.log('drive.comments.get:', subscription.lastPushedCommentId);
                if (isEventNew(change.time, commentData.modifiedTime) && isNewComment && subscription.lastPushedCommentId != commentData.id) {
                    console.log('===========NEW COMMENT============');
                    await Subscription.update(
                        {
                            lastPushedCommentId: commentData.id
                        },
                        {
                            where: {
                                id: subscription.id
                            }
                        }
                    );
                    const cardData =
                    {
                        userAvatar: commentData.author.photoLink ?? "https://fonts.gstatic.com/s/i/productlogos/drive_2020q4/v8/web-64dp/logo_drive_2020q4_color_2x_web_64dp.png",
                        username: commentData.author.displayName,
                        userEmail: commentData.author.emailAddress ?? "",
                        fileIconUrl: fileData.iconLink,
                        fileName: fileData.name,
                        commentContent: commentData.content,
                        quotedContent: commentData.quotedFileContent?.value ?? "",
                        fileUrl: fileData.webViewLink,
                        commentIconUrl: "https://lh3.googleusercontent.com/UeyfqNkFySLGNweD_KkSUPrMoUekF17KLqeWi18L2UwZZZrEbVl8vNledRTp2iRqJUE=w36",
                        userId: googleUser.id,
                        subscriptionId: subscription.id,
                        commentId: commentData.id,
                        fileId: fileId,
                        botId: bot.id
                    };
                    if (subscription.state === 'muted') {
                        continue;
                    }
                    else if (subscription.state === 'realtime') {
                        const card = cardBuilder.newCommentCard(cardData);
                        // Send adaptive card to your channel in RingCentral App
                        await bot.sendAdaptiveCard(subscription.groupId, card);
                    }
                    // daily, weekly -> cache
                    else if (subscription.state === 'daily' || subscription.state === 'weekly') {
                        const cachedInfo = subscription.cachedInfo;
                        cachedInfo.commentNotifications.push(cardData);
                        await Subscription.update(
                            {
                                cachedInfo
                            },
                            {
                                where: {
                                    id: subscription.id
                                }
                            });
                    }
                }
            }
        }
    }
}

async function SendDigestNotification(subscriptions) {
    if (subscriptions.length === 0) {
        return;
    }

    const botIds = [];
    for (const sub of subscriptions) {
        if (!botIds.includes(sub.botId)) {
            botIds.push(sub.botId);
        }
    }

    // different RingCentral App organizations would have different botId
    for (const botId of botIds) {
        console.log(`triggering digest for bot ${botId}`);
        const subscriptionsUnderOrg = subscriptions.filter(s => s.botId == botId);
        const bot = await Bot.findByPk(botId);
        const groupIds = [];
        for (const sub of subscriptionsUnderOrg) {
            if (!groupIds.includes(sub.groupId)) {
                groupIds.push(sub.groupId);
            }
        }

        for (const groupId of groupIds) {
            const subscriptionsInGroup = subscriptionsUnderOrg.filter(s => s.groupId == groupId);
            let cardData =
            {
                commentNotifications: []
            }

            console.log(`triggering digest to group ${groupId} with count ${subscriptionsInGroup.length}`);
            for (const sub of subscriptionsInGroup) {
                if (sub.cachedInfo.commentNotifications.length === 0) {
                    continue;
                }
                console.log(`notification to trigger count: ${sub.cachedInfo.commentNotifications.length}`);
                cardData.commentNotifications = cardData.commentNotifications.concat(sub.cachedInfo.commentNotifications);
            }

            const card = cardBuilder.commentDigestCard(cardData);
            // Send adaptive card to your channel in RingCentral App
            await bot.sendAdaptiveCard(groupId, card);

            // Clear db data only if all info is sent successfully
            for (const sub of subscriptionsInGroup) {
                await Subscription.update(
                    {
                        cachedInfo: {
                            commentNotifications: []
                        }
                    },
                    {
                        where: {
                            id: sub.id
                        }
                    }
                )
            }
        }
    }
}

function getFileTypeFromMimeType(mimeType) {
    switch (mimeType) {
        case 'application/vnd.google-apps.document':
            return 'document';
        case 'application/vnd.google-apps.folder':
            return 'folder';
        case 'application/vnd.google-apps.form':
            return 'form';
        case 'application/vnd.google-apps.presentation':
            return 'slide';
        case 'application/vnd.google-apps.spreadsheet':
            return 'spreadsheet';
        default:
            return 'file';
    }
}

function getVerbFromCapabilitiesRole(capabilities) {
    if (capabilities.canEdit) {
        return 'edit';
    }
    else if (capabilities.canComment) {
        return 'comment';
    }
    else {
        return 'view';
    }
}

exports.notification = notification;
exports.SendDigestNotification = SendDigestNotification;