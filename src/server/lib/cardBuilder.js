
const { Template } = require('adaptivecards-templating');
const subscriptionListCardTemplateJson = require('../adaptiveCardPayloads/subscriptionListCard.json');
const subscribeCardTemplateJson = require('../adaptiveCardPayloads/subscribeCard.json');

const { Subscription } = require('../models/subscriptionModel');
const { GoogleFile } = require('../models/googleFileModel');

async function buildSubscriptionListCard(botId, groupId) {
    const subscriptionListCardTemplate = new Template(subscriptionListCardTemplateJson);
    const subscriptions = await Subscription.findAll({
        where: {
            botId,
            groupId
        }
    });
    const activeSubscriptionList = [];;
    const mutedSubscriptionList = [];;
    for (const subscription of subscriptions) {
        const fileId = subscription.fileId;
        const file = await GoogleFile.findByPk(fileId);
        if (file) {
            if (subscription.state === 'muted') {
                mutedSubscriptionList.push({
                    iconLink: file.iconLink,
                    fileName: file.name,
                    rcUserName: subscription.rcUserName,
                    fileId,
                    botId: subscription.botId,
                    groupId: subscription.groupId,
                    subscriptionId: subscription.id,
                    subscriptionState: subscription.state
                });
            }
            else {
                activeSubscriptionList.push({
                    iconLink: file.iconLink,
                    fileName: file.name,
                    rcUserName: subscription.rcUserName,
                    fileId,
                    botId: subscription.botId,
                    groupId: subscription.groupId,
                    subscriptionId: subscription.id,
                    subscriptionState: subscription.state
                });
            }
        }
    }

    // Case: no item in list
    if (activeSubscriptionList.length === 0 && mutedSubscriptionList.length === 0) {
        return {
            isSuccessful: false,
            errorMessage: 'No subscription can be found. Please create with `sub` command.'
        }
    }

    const subscriptionListData = {
        activeSubscriptionList,
        mutedSubscriptionList,
        showActiveList: activeSubscriptionList.length > 0,
        showMutedList: mutedSubscriptionList.length > 0
    }

    const subscriptionListCard = subscriptionListCardTemplate.expand({
        $root: subscriptionListData
    });

    return {
        isSuccessful: true,
        card: subscriptionListCard
    };
}

async function buildSubscribeCard(botId){
    const subscribeCardTemplate = new Template(subscribeCardTemplateJson);
    const subscribeCardData = {
        mode: 'sub',
        title: 'Subscribe',
        botId
    }
    const subscribeCard = subscribeCardTemplate.expand({
        $root: subscribeCardData
    });
    
    return {
        isSuccessful: true,
        card: subscribeCard
    };
}

exports.buildSubscriptionListCard = buildSubscriptionListCard;
exports.buildSubscribeCard = buildSubscribeCard;