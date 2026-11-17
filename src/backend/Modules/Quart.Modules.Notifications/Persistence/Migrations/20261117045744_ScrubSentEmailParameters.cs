using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quart.Modules.Notifications.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ScrubSentEmailParameters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Sent emails kept their parameters, which can hold a one-time link. They are emptied on
            // sending from now on; this empties the ones already sent.
            migrationBuilder.Sql("UPDATE notifications.outbox_message SET parameters = '{}' WHERE sent_at IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
