require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

// =========================
// ENV VARIABLES
// =========================
const TOKEN = process.env.DISCORD_TOKEN;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID;
const CRYPTO_OWNER_ID = process.env.CRYPTO_OWNER_ID;
const PAYPAL_OWNER_ID = process.env.PAYPAL_OWNER_ID;

// Basic startup check
if (!TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in environment variables.');
  process.exit(1);
}

if (!PANEL_CHANNEL_ID) {
  console.error('❌ Missing PANEL_CHANNEL_ID in environment variables.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Store ticket owners in memory (NOTE: resets on restart)
const ticketOwners = new Map();

function sanitizeChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'ticket';
}

async function sendTicketPanel() {
  try {
    const channel = await client.channels.fetch(PANEL_CHANNEL_ID);

    if (!channel || channel.type !== ChannelType.GuildText) {
      console.log('❌ Invalid PANEL_CHANNEL_ID or it is not a text channel.');
      return;
    }

    const panelEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🛒 Purchase Support')
      .setDescription(
        [
          'Welcome to our **purchase support system**!',
          '',
          'If you would like to buy a product or need assistance with payment, press the button below to create a **private purchase ticket**.',
          '',
          '### What happens next?',
          '• 🎟️ A private ticket will be created just for you',
          '• 💬 You can choose your payment method',
          '• ⚡ Staff will assist you as quickly as possible',
          '',
          '> Please only open a ticket if you are ready to purchase or need real support.'
        ].join('\n')
      )
      .setFooter({ text: 'Fast • Secure • Private Purchase Support' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('purchase_ticket')
        .setLabel('Open Purchase Ticket')
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({
      embeds: [panelEmbed],
      components: [row]
    });

    console.log(`✅ Fancy ticket panel sent in #${channel.name}`);
  } catch (err) {
    console.error('❌ Failed to send ticket panel:', err);
  }
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await sendTicketPanel();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  const guild = interaction.guild;
  const member = interaction.member;
  const user = interaction.user;

  // =========================
  // OPEN PURCHASE TICKET
  // =========================
  if (interaction.customId === 'purchase_ticket') {
    let category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'tickets'
    );

    if (!category) {
      category = await guild.channels.create({
        name: 'tickets',
        type: ChannelType.GuildCategory
      });
    }

    // Prevent duplicate tickets
    const existingTicket = guild.channels.cache.find(
      c =>
        c.parentId === category.id &&
        ticketOwners.get(c.id) === user.id
    );

    if (existingTicket) {
      return interaction.reply({
        content: `🎟️ You already have an open purchase ticket: ${existingTicket}`,
        ephemeral: true
      });
    }

    const ticketName = `ticket-${sanitizeChannelName(member.displayName)}`;

    const ticketChannel = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels
          ]
        },
        {
          id: guild.ownerId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

    ticketOwners.set(ticketChannel.id, user.id);

    // Private confirmation
    await interaction.reply({
      content: `✅ Your purchase ticket has been created: ${ticketChannel}`,
      ephemeral: true
    });

    const ticketEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🎟️ Purchase Ticket Created')
      .setDescription(
        [
          `Welcome ${user}!`,
          '',
          'Your private purchase ticket has been opened successfully.',
          '',
          '### Next Step',
          'Please choose **how you would like to pay** using the buttons below.',
          '',
          '### Available Payment Methods',
          '• ₿ **Crypto**',
          '• 💸 **PayPal**',
          '',
          '> A staff member will assist you shortly after you choose your payment method.'
        ].join('\n')
      )
      .setFooter({ text: 'Use the buttons below to continue or close your ticket.' })
      .setTimestamp();

    const paymentRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pay_crypto')
        .setLabel('Crypto')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('pay_paypal')
        .setLabel('PayPal')
        .setEmoji('💸')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `${user}`,
      embeds: [ticketEmbed],
      components: [paymentRow]
    });

    return;
  }

  // =========================
  // PAY: CRYPTO
  // =========================
  if (interaction.customId === 'pay_crypto') {
    if (!CRYPTO_OWNER_ID) {
      return interaction.reply({
        content: '❌ CRYPTO_OWNER_ID is not set in environment variables.',
        ephemeral: true
      });
    }

    const cryptoEmbed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('💰 Crypto Payment Selected')
      .setDescription(
        [
          `${interaction.user} has selected **Crypto** as their payment method.`,
          '',
          'A staff member has been notified and will be with you shortly.',
          '',
          '> Please wait here while your payment is handled.'
        ].join('\n')
      )
      .setFooter({ text: 'Crypto payment request sent.' })
      .setTimestamp();

    await interaction.reply({
      content: `<@${CRYPTO_OWNER_ID}> 🚨 New **Crypto** payment request from ${interaction.user}`,
      embeds: [cryptoEmbed]
    });

    return;
  }

  // =========================
  // PAY: PAYPAL
  // =========================
  if (interaction.customId === 'pay_paypal') {
    if (!PAYPAL_OWNER_ID) {
      return interaction.reply({
        content: '❌ PAYPAL_OWNER_ID is not set in environment variables.',
        ephemeral: true
      });
    }

    const paypalEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('💸 PayPal Payment Selected')
      .setDescription(
        [
          `${interaction.user} has selected **PayPal** as their payment method.`,
          '',
          'A staff member has been notified and will be with you shortly.',
          '',
          '> Please wait here while your payment is handled.'
        ].join('\n')
      )
      .setFooter({ text: 'PayPal payment request sent.' })
      .setTimestamp();

    await interaction.reply({
      content: `<@${PAYPAL_OWNER_ID}> 🚨 New **PayPal** payment request from ${interaction.user}`,
      embeds: [paypalEmbed]
    });

    return;
  }

  // =========================
  // CLOSE TICKET
  // =========================
  if (interaction.customId === 'close_ticket') {
    const ownerId = ticketOwners.get(interaction.channel.id);

    if (user.id !== ownerId && user.id !== guild.ownerId) {
      return interaction.reply({
        content: '❌ Only the ticket owner or server owner can close this ticket.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: '🗑️ Closing ticket... This channel will be deleted in a moment.',
      ephemeral: true
    });

    ticketOwners.delete(interaction.channel.id);

    setTimeout(async () => {
      try {
        await interaction.channel.delete();
      } catch (err) {
        console.error('❌ Failed to delete ticket channel:', err);
      }
    }, 1500);

    return;
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    if (!MEMBER_ROLE_ID) {
      console.log('❌ MEMBER_ROLE_ID is not set in environment variables.');
      return;
    }

    const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);

    if (!role) {
      console.log('❌ Member role not found.');
      return;
    }

    await member.roles.add(role);
    console.log(`✅ Gave ${member.user.tag} the Member role`);
  } catch (err) {
    console.error(`❌ Failed to give role to ${member.user.tag}:`, err);
  }
});

client.login(TOKEN);
