<?php
/**
 * Standalone Quick Post screen and its restricted posting credentials.
 *
 * @package Kototsugi
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'KOTOTSUGI_QUICK_POST_OPTION', 'kototsugi_quick_post_settings' );
define( 'KOTOTSUGI_QUICK_POST_COOKIE', 'kototsugi_quick_post_session' );
define( 'KOTOTSUGI_QUICK_POST_MAX_SOURCE_BYTES', 2 * MB_IN_BYTES );
define( 'KOTOTSUGI_QUICK_POST_MAX_IMAGES', 5 );
define( 'KOTOTSUGI_QUICK_POST_MAX_BLOCK_DEPTH', 20 );
define( 'KOTOTSUGI_QUICK_POST_MAX_BLOCKS', 1000 );

/**
 * Returns Quick Post defaults.
 *
 * @return array<string, mixed>
 */
function kototsugi_quick_post_defaults() {
	return array(
		'enabled'         => false,
		'status'          => 'draft',
		'language'        => 'site',
		'post_type'       => 'post',
		'author_id'       => 0,
		'category_id'     => 0,
		'password_hash'   => '',
		'session_version' => 1,
	);
}

/**
 * Returns locale codes supported by the bundled Quick Post translations.
 *
 * @return string[]
 */
function kototsugi_quick_post_locale_codes() {
	return array(
		'ja',
		'en_US',
		'es_ES',
		'de_DE',
		'fr_FR',
		'pt_BR',
		'it_IT',
		'ru_RU',
		'nl_NL',
		'zh_CN',
		'pl_PL',
		'tr_TR',
		'id_ID',
		'zh_TW',
		'ko_KR',
	);
}

/**
 * Makes bundled locales available to WordPress' locale switcher.
 *
 * The filter is removed on init so these plugin-only translations are not
 * advertised as complete WordPress language packs elsewhere in wp-admin.
 *
 * @param string[]    $languages Available WordPress locales.
 * @param string|null $directory Language directory, or null for the default.
 * @return string[]
 */
function kototsugi_register_quick_post_locales( $languages, $directory = null ) {
	if ( null !== $directory ) {
		return $languages;
	}

	return array_values( array_unique( array_merge( $languages, kototsugi_quick_post_locale_codes() ) ) );
}
add_filter( 'get_available_languages', 'kototsugi_register_quick_post_locales', 10, 2 );

/**
 * Stops exposing plugin-only locales after WordPress initializes its switcher.
 */
function kototsugi_remove_quick_post_locale_filter() {
	remove_filter( 'get_available_languages', 'kototsugi_register_quick_post_locales', 10 );
}
add_action( 'init', 'kototsugi_remove_quick_post_locale_filter', 0 );

/**
 * Returns the display languages bundled with Quick Post.
 *
 * @return array<string, string>
 */
function kototsugi_quick_post_languages() {
	return array(
		'ja'    => __( 'Japanese', 'kototsugi' ),
		'en_US' => __( 'English', 'kototsugi' ),
		'es_ES' => __( 'Spanish', 'kototsugi' ),
		'de_DE' => __( 'German', 'kototsugi' ),
		'fr_FR' => __( 'French', 'kototsugi' ),
		'pt_BR' => __( 'Portuguese (Brazil)', 'kototsugi' ),
		'it_IT' => __( 'Italian', 'kototsugi' ),
		'ru_RU' => __( 'Russian', 'kototsugi' ),
		'nl_NL' => __( 'Dutch', 'kototsugi' ),
		'zh_CN' => __( 'Chinese (Simplified)', 'kototsugi' ),
		'pl_PL' => __( 'Polish', 'kototsugi' ),
		'tr_TR' => __( 'Turkish', 'kototsugi' ),
		'id_ID' => __( 'Indonesian', 'kototsugi' ),
		'zh_TW' => __( 'Chinese (Traditional, Taiwan)', 'kototsugi' ),
		'ko_KR' => __( 'Korean', 'kototsugi' ),
	);
}

/**
 * Returns content types suitable for Quick Post articles.
 *
 * @return array<string, WP_Post_Type>
 */
function kototsugi_quick_post_types() {
	$post_types = get_post_types( array( 'show_ui' => true ), 'objects' );

	$post_types = array_filter(
		$post_types,
		static function ( $post_type ) {
			if ( $post_type->_builtin && ! in_array( $post_type->name, array( 'post', 'page' ), true ) ) {
				return false;
			}

			return post_type_supports( $post_type->name, 'title' ) && post_type_supports( $post_type->name, 'editor' );
		}
	);

	uasort(
		$post_types,
		static function ( $first, $second ) {
			return strnatcasecmp( $first->labels->singular_name, $second->labels->singular_name );
		}
	);

	return $post_types;
}

/**
 * Returns the capability required to create a selected content type.
 *
 * @param WP_Post_Type $post_type Post type object.
 * @return string
 */
function kototsugi_quick_post_create_capability( $post_type ) {
	return ! empty( $post_type->cap->create_posts ) ? $post_type->cap->create_posts : $post_type->cap->edit_posts;
}

/**
 * Counts passphrase characters without changing the entered value.
 *
 * @param string $passphrase Entered passphrase.
 * @return int
 */
function kototsugi_quick_post_passphrase_length( $passphrase ) {
	if ( function_exists( 'mb_strlen' ) ) {
		return (int) mb_strlen( $passphrase, 'UTF-8' );
	}

	$count = preg_match_all( '/./us', $passphrase, $matches );

	return false === $count ? strlen( $passphrase ) : (int) $count;
}

/**
 * Returns normalized Quick Post settings.
 *
 * @return array<string, mixed>
 */
function kototsugi_get_quick_post_settings() {
	$settings = wp_parse_args( get_option( KOTOTSUGI_QUICK_POST_OPTION, array() ), kototsugi_quick_post_defaults() );

	$settings['enabled']         = (bool) $settings['enabled'];
	$settings['status']          = 'publish' === $settings['status'] ? 'publish' : 'draft';
	$settings['language']        = isset( kototsugi_quick_post_languages()[ $settings['language'] ] ) || 'site' === $settings['language'] ? $settings['language'] : 'site';
	$settings['post_type']       = sanitize_key( $settings['post_type'] );
	$settings['author_id']       = absint( $settings['author_id'] );
	$settings['category_id']     = absint( $settings['category_id'] );
	$settings['password_hash']   = (string) $settings['password_hash'];
	$settings['session_version'] = max( 1, absint( $settings['session_version'] ) );

	if ( ! isset( kototsugi_quick_post_types()[ $settings['post_type'] ] ) ) {
		$settings['post_type'] = 'post';
	}

	return $settings;
}

/**
 * Switches the standalone posting page to its configured display language.
 *
 * @param array<string, mixed> $settings Quick Post settings.
 */
function kototsugi_switch_quick_post_locale( $settings ) {
	if ( empty( $settings['language'] ) || 'site' === $settings['language'] ) {
		return;
	}

	$locale = $settings['language'];
	if ( ! switch_to_locale( $locale ) && determine_locale() !== $locale ) {
		return;
	}

	unload_textdomain( 'kototsugi', true );
	$mofile = plugin_dir_path( KOTOTSUGI_FILE ) . 'languages/kototsugi-' . $locale . '.mo';
	if ( is_readable( $mofile ) ) {
		load_textdomain( 'kototsugi', $mofile, $locale );
	}
}

/**
 * Registers the public route.
 */
function kototsugi_register_quick_post_route() {
	add_rewrite_rule( '^kototsugi-post/?$', 'index.php?kototsugi_quick_post=1', 'top' );
}
add_action( 'init', 'kototsugi_register_quick_post_route' );

/**
 * Adds the route query variable.
 *
 * @param string[] $variables Public query variables.
 * @return string[]
 */
function kototsugi_quick_post_query_vars( $variables ) {
	$variables[] = 'kototsugi_quick_post';

	return $variables;
}
add_filter( 'query_vars', 'kototsugi_quick_post_query_vars' );

/**
 * Flushes the public route when the plugin is activated.
 */
function kototsugi_activate_quick_post() {
	kototsugi_register_quick_post_route();
	flush_rewrite_rules();
	update_option( 'kototsugi_quick_post_rewrite_version', KOTOTSUGI_VERSION, false );
}
register_activation_hook( KOTOTSUGI_FILE, 'kototsugi_activate_quick_post' );

/**
 * Refreshes the route once after plugin updates that add or change it.
 */
function kototsugi_maybe_refresh_quick_post_route() {
	if ( KOTOTSUGI_VERSION === get_option( 'kototsugi_quick_post_rewrite_version' ) ) {
		return;
	}

	flush_rewrite_rules( false );
	update_option( 'kototsugi_quick_post_rewrite_version', KOTOTSUGI_VERSION, false );
}
add_action( 'init', 'kototsugi_maybe_refresh_quick_post_route', 20 );

/**
 * Returns the public Quick Post URL.
 *
 * @return string
 */
function kototsugi_quick_post_url() {
	if ( get_option( 'permalink_structure' ) ) {
		return home_url( '/kototsugi-post/' );
	}

	return add_query_arg( 'kototsugi_quick_post', '1', home_url( '/' ) );
}

/**
 * Returns whether the current request targets Quick Post.
 *
 * @return bool
 */
function kototsugi_is_quick_post_request() {
	if ( get_query_var( 'kototsugi_quick_post' ) ) {
		return true;
	}

	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only public route selector.
	return isset( $_GET['kototsugi_quick_post'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['kototsugi_quick_post'] ) );
}

/**
 * Adds the settings page.
 */
function kototsugi_add_quick_post_settings_page() {
	add_options_page(
		__( 'KOTOTSUGI Quick Post', 'kototsugi' ),
		__( 'KOTOTSUGI', 'kototsugi' ),
		'manage_options',
		'kototsugi',
		'kototsugi_render_quick_post_settings_page'
	);
}
add_action( 'admin_menu', 'kototsugi_add_quick_post_settings_page' );

/**
 * Adds a settings shortcut to the Plugins screen.
 *
 * @param string[] $links Existing action links.
 * @return string[]
 */
function kototsugi_quick_post_action_links( $links ) {
	array_unshift(
		$links,
		'<a href="' . esc_url( admin_url( 'options-general.php?page=kototsugi' ) ) . '">' . esc_html__( 'Quick Post settings', 'kototsugi' ) . '</a>'
	);

	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( KOTOTSUGI_FILE ), 'kototsugi_quick_post_action_links' );

/**
 * Returns users that can own at least one available Quick Post content type.
 *
 * @return WP_User[]
 */
function kototsugi_quick_post_authors() {
	$capabilities = array();
	foreach ( kototsugi_quick_post_types() as $post_type ) {
		$capabilities[] = kototsugi_quick_post_create_capability( $post_type );
	}
	$capabilities = array_unique( $capabilities );

	$users = get_users(
		array(
			'orderby' => 'display_name',
			'order'   => 'ASC',
		)
	);

	return array_values(
		array_filter(
			$users,
			static function ( $user ) use ( $capabilities ) {
				foreach ( $capabilities as $capability ) {
					if ( user_can( $user, $capability ) ) {
						return true;
					}
				}

				return false;
			}
		)
	);
}

/**
 * Redirects back to settings with a result code.
 *
 * @param string $result Result code.
 */
function kototsugi_quick_post_settings_redirect( $result ) {
	wp_safe_redirect(
		add_query_arg(
			'kototsugi-result',
			$result,
			admin_url( 'options-general.php?page=kototsugi' )
		)
	);
	exit;
}

/**
 * Saves Quick Post settings.
 */
function kototsugi_save_quick_post_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to change these settings.', 'kototsugi' ) );
	}

	check_admin_referer( 'kototsugi_save_quick_post' );

	$current     = kototsugi_get_quick_post_settings();
	$enabled     = isset( $_POST['enabled'] );
	$status      = isset( $_POST['status'] ) && 'publish' === sanitize_key( wp_unslash( $_POST['status'] ) ) ? 'publish' : 'draft';
	$language    = isset( $_POST['language'] ) ? sanitize_text_field( wp_unslash( $_POST['language'] ) ) : 'site';
	$post_type   = isset( $_POST['post_type'] ) ? sanitize_key( wp_unslash( $_POST['post_type'] ) ) : 'post';
	$author_id   = isset( $_POST['author_id'] ) ? absint( $_POST['author_id'] ) : 0;
	$category_id = isset( $_POST['category_id'] ) ? absint( $_POST['category_id'] ) : 0;
	// Passwords must be verified byte-for-byte and must not be altered by text sanitizers.
	$password    = isset( $_POST['quick_post_password'] ) ? (string) wp_unslash( $_POST['quick_post_password'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	$post_types  = kototsugi_quick_post_types();
	$type_object = isset( $post_types[ $post_type ] ) ? $post_types[ $post_type ] : null;
	$author      = $author_id ? get_user_by( 'id', $author_id ) : false;
	$language    = isset( kototsugi_quick_post_languages()[ $language ] ) || 'site' === $language ? $language : 'site';

	if ( ! $type_object ) {
		kototsugi_quick_post_settings_redirect( 'invalid-post-type' );
	}
	if ( ! $author || ! user_can( $author, kototsugi_quick_post_create_capability( $type_object ) ) ) {
		kototsugi_quick_post_settings_redirect( 'invalid-author' );
	}
	if ( 'publish' === $status && ! user_can( $author, $type_object->cap->publish_posts ) ) {
		kototsugi_quick_post_settings_redirect( 'author-cannot-publish' );
	}
	if ( ! is_object_in_taxonomy( $post_type, 'category' ) ) {
		$category_id = 0;
	} elseif ( $category_id && ! term_exists( $category_id, 'category' ) ) {
		kototsugi_quick_post_settings_redirect( 'invalid-category' );
	}
	if ( $password && kototsugi_quick_post_passphrase_length( $password ) < 8 ) {
		kototsugi_quick_post_settings_redirect( 'short-password' );
	}
	if ( $enabled && ! $password && ! $current['password_hash'] ) {
		kototsugi_quick_post_settings_redirect( 'password-required' );
	}

	$revoke_sessions = (bool) $current['enabled'] && ! $enabled;
	$revoke_sessions = $revoke_sessions || $current['status'] !== $status || $current['post_type'] !== $post_type || (int) $current['author_id'] !== $author_id;

	$current['enabled']     = $enabled;
	$current['status']      = $status;
	$current['language']    = $language;
	$current['post_type']   = $post_type;
	$current['author_id']   = $author_id;
	$current['category_id'] = $category_id;

	if ( $password ) {
		$current['password_hash'] = wp_hash_password( $password );
		$revoke_sessions          = true;
	}
	if ( $revoke_sessions ) {
		$current['session_version'] = (int) $current['session_version'] + 1;
	}

	update_option( KOTOTSUGI_QUICK_POST_OPTION, $current, false );
	kototsugi_quick_post_settings_redirect( 'saved' );
}
add_action( 'admin_post_kototsugi_save_quick_post', 'kototsugi_save_quick_post_settings' );

/**
 * Invalidates every existing Quick Post browser session.
 */
function kototsugi_revoke_quick_post_sessions() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to change these settings.', 'kototsugi' ) );
	}

	check_admin_referer( 'kototsugi_revoke_quick_post_sessions' );
	$settings                    = kototsugi_get_quick_post_settings();
	$settings['session_version'] = (int) $settings['session_version'] + 1;
	update_option( KOTOTSUGI_QUICK_POST_OPTION, $settings, false );
	kototsugi_quick_post_settings_redirect( 'sessions-revoked' );
}
add_action( 'admin_post_kototsugi_revoke_quick_post_sessions', 'kototsugi_revoke_quick_post_sessions' );

/**
 * Renders the Quick Post settings page.
 */
function kototsugi_render_quick_post_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	kototsugi_enqueue_passphrase_assets();

	$settings   = kototsugi_get_quick_post_settings();
	$authors    = kototsugi_quick_post_authors();
	$post_types = kototsugi_quick_post_types();
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only status notice selected from a fixed local map.
	$result   = isset( $_GET['kototsugi-result'] ) ? sanitize_key( wp_unslash( $_GET['kototsugi-result'] ) ) : '';
	$messages = array(
		'saved'                 => array( 'success', __( 'Quick Post settings saved.', 'kototsugi' ) ),
		'sessions-revoked'      => array( 'success', __( 'Every Quick Post browser was signed out.', 'kototsugi' ) ),
		'invalid-author'        => array( 'error', __( 'Choose an author who can create the selected content type.', 'kototsugi' ) ),
		'author-cannot-publish' => array( 'error', __( 'The selected author cannot publish the selected content type.', 'kototsugi' ) ),
		'invalid-post-type'     => array( 'error', __( 'Choose an available publishing destination.', 'kototsugi' ) ),
		'invalid-category'      => array( 'error', __( 'Choose an available category.', 'kototsugi' ) ),
		'short-password'        => array( 'error', __( 'Use at least 8 characters for the passphrase.', 'kototsugi' ) ),
		'password-required'     => array( 'error', __( 'Set a passphrase before enabling Quick Post.', 'kototsugi' ) ),
	);
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'KOTOTSUGI Quick Post', 'kototsugi' ); ?></h1>
		<p><?php esc_html_e( 'Quick Post reduces the learning and memory required to publish. It is intended for people who find the WordPress admin screen difficult, including older users, people with disabilities, and anyone who needs a simpler interface.', 'kototsugi' ); ?></p>
		<p><?php esc_html_e( 'Anyone can start with only a title and article text. As they become comfortable, blank lines, lists, short headings, and images add more structure. Learning Markdown is not required.', 'kototsugi' ); ?></p>
		<?php if ( isset( $messages[ $result ] ) ) : ?>
			<div class="notice notice-<?php echo esc_attr( $messages[ $result ][0] ); ?> is-dismissible"><p><?php echo esc_html( $messages[ $result ][1] ); ?></p></div>
		<?php endif; ?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="kototsugi_save_quick_post">
			<?php wp_nonce_field( 'kototsugi_save_quick_post' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Quick Post', 'kototsugi' ); ?></th>
					<td><label><input type="checkbox" name="enabled" value="1" <?php checked( $settings['enabled'] ); ?>> <?php esc_html_e( 'Enable the standalone posting page', 'kototsugi' ); ?></label></td>
				</tr>
				<tr>
					<th scope="row"><label for="kototsugi-quick-post-url"><?php esc_html_e( 'Posting URL', 'kototsugi' ); ?></label></th>
					<td>
						<input id="kototsugi-quick-post-url" class="regular-text code" type="url" readonly value="<?php echo esc_attr( kototsugi_quick_post_url() ); ?>">
						<p class="description"><a href="<?php echo esc_url( kototsugi_quick_post_url() ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Open Quick Post', 'kototsugi' ); ?></a></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="kototsugi-quick-post-language"><?php esc_html_e( 'Display language', 'kototsugi' ); ?></label></th>
					<td>
						<select id="kototsugi-quick-post-language" name="language">
							<option value="site" <?php selected( $settings['language'], 'site' ); ?>><?php esc_html_e( 'Use the site language', 'kototsugi' ); ?></option>
							<?php foreach ( kototsugi_quick_post_languages() as $locale => $language_name ) : ?>
								<option value="<?php echo esc_attr( $locale ); ?>" <?php selected( $settings['language'], $locale ); ?>><?php echo esc_html( $language_name ); ?></option>
							<?php endforeach; ?>
						</select>
						<p class="description"><?php esc_html_e( 'Used on the passphrase, article, review, and completion screens.', 'kototsugi' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="kototsugi-quick-post-password"><?php esc_html_e( 'Passphrase', 'kototsugi' ); ?></label></th>
					<td>
						<div class="kototsugi-passphrase-field">
							<input id="kototsugi-quick-post-password" class="regular-text kototsugi-passphrase-input" type="text" name="quick_post_password" minlength="8" autocomplete="new-password" inputmode="text" autocapitalize="none" autocorrect="off" spellcheck="false">
							<button class="kototsugi-passphrase-toggle" type="button" aria-controls="kototsugi-quick-post-password" aria-pressed="false" aria-label="<?php esc_attr_e( 'Show passphrase', 'kototsugi' ); ?>" title="<?php esc_attr_e( 'Show passphrase', 'kototsugi' ); ?>" data-kototsugi-passphrase-toggle data-show-label="<?php esc_attr_e( 'Show passphrase', 'kototsugi' ); ?>" data-hide-label="<?php esc_attr_e( 'Hide passphrase', 'kototsugi' ); ?>">
								<span class="dashicons dashicons-visibility" aria-hidden="true"></span>
								<span class="screen-reader-text"><?php esc_html_e( 'Show passphrase', 'kototsugi' ); ?></span>
							</button>
						</div>
						<p class="description"><?php echo esc_html( $settings['password_hash'] ? __( 'Leave blank to keep the current passphrase. Entering a new one signs out every browser.', 'kototsugi' ) : __( 'Use at least 8 characters. Share it only with people allowed to post.', 'kototsugi' ) ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="kototsugi-quick-post-type"><?php esc_html_e( 'Publishing destination', 'kototsugi' ); ?></label></th>
					<td>
						<select id="kototsugi-quick-post-type" name="post_type" required>
							<?php foreach ( $post_types as $post_type ) : ?>
								<option value="<?php echo esc_attr( $post_type->name ); ?>" <?php selected( $settings['post_type'], $post_type->name ); ?>><?php echo esc_html( $post_type->labels->singular_name ); ?></option>
							<?php endforeach; ?>
						</select>
						<p class="description"><?php esc_html_e( 'Posts, Pages, and custom post types that support titles and the editor are shown. The contributor cannot change this choice.', 'kototsugi' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="kototsugi-quick-post-author"><?php esc_html_e( 'Post author', 'kototsugi' ); ?></label></th>
					<td>
						<select id="kototsugi-quick-post-author" name="author_id" required>
							<option value=""><?php esc_html_e( 'Choose an author', 'kototsugi' ); ?></option>
							<?php foreach ( $authors as $author ) : ?>
								<option value="<?php echo esc_attr( $author->ID ); ?>" <?php selected( $settings['author_id'], $author->ID ); ?>><?php echo esc_html( $author->display_name ); ?></option>
							<?php endforeach; ?>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="kototsugi-quick-post-status"><?php esc_html_e( 'After submission', 'kototsugi' ); ?></label></th>
					<td>
						<select id="kototsugi-quick-post-status" name="status">
							<option value="draft" <?php selected( $settings['status'], 'draft' ); ?>><?php esc_html_e( 'Save as a draft', 'kototsugi' ); ?></option>
							<option value="publish" <?php selected( $settings['status'], 'publish' ); ?>><?php esc_html_e( 'Publish immediately', 'kototsugi' ); ?></option>
						</select>
						<p class="description"><?php esc_html_e( 'This choice is fixed on the posting page so the contributor cannot change it by mistake.', 'kototsugi' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="kototsugi-quick-post-category"><?php esc_html_e( 'Default category', 'kototsugi' ); ?></label></th>
					<td>
						<?php
						wp_dropdown_categories(
							array(
								'id'               => 'kototsugi-quick-post-category',
								'name'             => 'category_id',
								'hide_empty'       => false,
								'hierarchical'     => true,
								'show_option_none' => __( 'Use the site default', 'kototsugi' ),
								'option_none_value' => '0',
								'selected'         => $settings['category_id'],
							)
						);
						?>
						<p class="description"><?php esc_html_e( 'Applied only when the publishing destination supports categories.', 'kototsugi' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button( __( 'Save Quick Post settings', 'kototsugi' ) ); ?>
		</form>
		<?php if ( $settings['password_hash'] ) : ?>
			<hr>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="kototsugi_revoke_quick_post_sessions">
				<?php wp_nonce_field( 'kototsugi_revoke_quick_post_sessions' ); ?>
				<?php submit_button( __( 'Sign out every Quick Post browser', 'kototsugi' ), 'secondary', 'submit', false ); ?>
			</form>
		<?php endif; ?>
	</div>
	<?php
}

/**
 * Encodes binary-safe data for a cookie.
 *
 * @param string $value Raw data.
 * @return string
 */
function kototsugi_quick_post_base64url_encode( $value ) {
	return rtrim( strtr( base64_encode( $value ), '+/', '-_' ), '=' );
}

/**
 * Decodes a base64url value.
 *
 * @param string $value Encoded data.
 * @return string|false
 */
function kototsugi_quick_post_base64url_decode( $value ) {
	return base64_decode( strtr( $value, '-_', '+/' ), true );
}

/**
 * Returns the current session signing key.
 *
 * @param array<string, mixed> $settings Quick Post settings.
 * @return string
 */
function kototsugi_quick_post_signing_key( $settings ) {
	return hash_hmac( 'sha256', (string) $settings['password_hash'] . '|' . (int) $settings['session_version'], wp_salt( 'auth' ) );
}

/**
 * Returns the transient key for one server-tracked Quick Post session.
 *
 * @param string $session_id Random session identifier.
 * @return string
 */
function kototsugi_quick_post_session_key( $session_id ) {
	return 'kototsugi_qps_' . substr( hash_hmac( 'sha256', $session_id, wp_salt( 'auth' ) ), 0, 40 );
}

/**
 * Creates a signed 30-day browser session.
 *
 * @param array<string, mixed> $settings Quick Post settings.
 * @return string
 */
function kototsugi_create_quick_post_session( $settings ) {
	$session_id = wp_generate_password( 64, false, false );
	$expires    = time() + MONTH_IN_SECONDS;
	set_transient( kototsugi_quick_post_session_key( $session_id ), (int) $settings['session_version'], MONTH_IN_SECONDS );

	$payload   = kototsugi_quick_post_base64url_encode(
		wp_json_encode(
			array(
				'expires'    => $expires,
				'version'    => (int) $settings['session_version'],
				'session_id' => $session_id,
			)
		)
	);
	$signature = hash_hmac( 'sha256', $payload, kototsugi_quick_post_signing_key( $settings ) );

	return $payload . '.' . $signature;
}

/**
 * Returns verified browser session data.
 *
 * @param string               $cookie   Session cookie.
 * @param array<string, mixed> $settings Quick Post settings.
 * @return array<string, mixed>|false
 */
function kototsugi_get_quick_post_session( $cookie, $settings ) {
	$parts = explode( '.', (string) $cookie, 2 );

	if ( 2 !== count( $parts ) || ! $parts[0] || ! $parts[1] ) {
		return false;
	}

	$expected = hash_hmac( 'sha256', $parts[0], kototsugi_quick_post_signing_key( $settings ) );
	if ( ! hash_equals( $expected, $parts[1] ) ) {
		return false;
	}

	$decoded = kototsugi_quick_post_base64url_decode( $parts[0] );
	$payload = $decoded ? json_decode( $decoded, true ) : null;

	if ( ! is_array( $payload ) || ! isset( $payload['expires'], $payload['version'], $payload['session_id'] ) ) {
		return false;
	}
	if ( (int) $payload['expires'] < time() || (int) $payload['version'] !== (int) $settings['session_version'] ) {
		return false;
	}
	if ( ! is_string( $payload['session_id'] ) || 1 !== preg_match( '/\A[A-Za-z0-9]{64}\z/D', $payload['session_id'] ) ) {
		return false;
	}
	if ( (int) get_transient( kototsugi_quick_post_session_key( $payload['session_id'] ) ) !== (int) $settings['session_version'] ) {
		return false;
	}

	return $payload;
}

/**
 * Verifies a browser session.
 *
 * @param string               $cookie   Session cookie.
 * @param array<string, mixed> $settings Quick Post settings.
 * @return bool
 */
function kototsugi_verify_quick_post_session( $cookie, $settings ) {
	return false !== kototsugi_get_quick_post_session( $cookie, $settings );
}

/**
 * Revokes one browser session.
 *
 * @param string               $cookie   Session cookie.
 * @param array<string, mixed> $settings Quick Post settings.
 */
function kototsugi_revoke_quick_post_session( $cookie, $settings ) {
	$session = kototsugi_get_quick_post_session( $cookie, $settings );
	if ( $session ) {
		delete_transient( kototsugi_quick_post_session_key( $session['session_id'] ) );
	}
}

/**
 * Returns a session-scoped browser storage key.
 *
 * @param string               $cookie   Session cookie.
 * @param array<string, mixed> $settings Quick Post settings.
 * @return string
 */
function kototsugi_quick_post_storage_key( $cookie, $settings ) {
	$session = kototsugi_get_quick_post_session( $cookie, $settings );
	$suffix  = $session ? '-' . substr( hash( 'sha256', $session['session_id'] ), 0, 20 ) : '';

	return 'kototsugi-quick-post-' . md5( home_url( '/' ) ) . $suffix;
}

/**
 * Returns the raw session cookie.
 *
 * @return string
 */
function kototsugi_get_quick_post_cookie() {
	return isset( $_COOKIE[ KOTOTSUGI_QUICK_POST_COOKIE ] ) ? sanitize_text_field( wp_unslash( $_COOKIE[ KOTOTSUGI_QUICK_POST_COOKIE ] ) ) : '';
}

/**
 * Sets or removes the Quick Post session cookie.
 *
 * @param string $value      Cookie value.
 * @param int    $expiration Expiration timestamp.
 */
function kototsugi_set_quick_post_cookie( $value, $expiration ) {
	setcookie(
		KOTOTSUGI_QUICK_POST_COOKIE,
		$value,
		array(
			'expires'  => $expiration,
			'path'     => '/',
			'secure'   => is_ssl(),
			'httponly' => true,
			'samesite' => 'Lax',
		)
	);
}

/**
 * Creates a form token bound to the signed browser session.
 *
 * @param string $action Form action.
 * @param string $cookie Session cookie.
 * @param int    $tick   Optional half-day tick.
 * @return string
 */
function kototsugi_quick_post_form_token( $action, $cookie, $tick = 0 ) {
	$tick      = $tick ? $tick : (int) ceil( time() / ( 12 * HOUR_IN_SECONDS ) );
	$signature = hash_hmac( 'sha256', $action . '|' . $tick, wp_salt( 'nonce' ) . '|' . $cookie );

	return $tick . ':' . $signature;
}

/**
 * Verifies a session-bound form token.
 *
 * @param string $token  Submitted token.
 * @param string $action Form action.
 * @param string $cookie Session cookie.
 * @return bool
 */
function kototsugi_verify_quick_post_form_token( $token, $action, $cookie ) {
	$parts = explode( ':', (string) $token, 2 );
	$now   = (int) ceil( time() / ( 12 * HOUR_IN_SECONDS ) );

	if ( 2 !== count( $parts ) || ! ctype_digit( $parts[0] ) ) {
		return false;
	}

	$tick = (int) $parts[0];
	if ( $tick !== $now && $tick !== $now - 1 ) {
		return false;
	}

	return hash_equals( kototsugi_quick_post_form_token( $action, $cookie, $tick ), $token );
}

/**
 * Creates a short-lived completion receipt bound to one session and post.
 *
 * @param int    $post_id Post ID.
 * @param string $cookie  Session cookie.
 * @param int    $tick    Optional 15-minute tick.
 * @return string
 */
function kototsugi_quick_post_receipt_token( $post_id, $cookie, $tick = 0 ) {
	$tick      = $tick ? $tick : (int) floor( time() / ( 15 * MINUTE_IN_SECONDS ) );
	$signature = hash_hmac( 'sha256', (int) $post_id . '|' . $tick, wp_salt( 'nonce' ) . '|' . $cookie );

	return $tick . ':' . $signature;
}

/**
 * Verifies a completion receipt.
 *
 * @param string $token   Receipt token.
 * @param int    $post_id Post ID.
 * @param string $cookie  Session cookie.
 * @return bool
 */
function kototsugi_verify_quick_post_receipt_token( $token, $post_id, $cookie ) {
	$parts = explode( ':', (string) $token, 2 );
	$now   = (int) floor( time() / ( 15 * MINUTE_IN_SECONDS ) );

	if ( 2 !== count( $parts ) || ! ctype_digit( $parts[0] ) ) {
		return false;
	}

	$tick = (int) $parts[0];
	if ( $tick !== $now && $tick !== $now - 1 ) {
		return false;
	}

	return hash_equals( kototsugi_quick_post_receipt_token( $post_id, $cookie, $tick ), $token );
}

/**
 * Returns a privacy-preserving login throttle key.
 *
 * @return string
 */
function kototsugi_quick_post_throttle_key() {
	$address = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';

	return 'kototsugi_qp_' . substr( hash_hmac( 'sha256', $address, wp_salt( 'auth' ) ), 0, 32 );
}

/**
 * Acquires a short database-backed lock.
 *
 * @param string $resource Resource identifier.
 * @return array<string, string>|false Lock owner data, or false when already locked.
 */
function kototsugi_quick_post_acquire_lock( $resource ) {
	$lock_key = 'kototsugi_qpl_' . substr( hash_hmac( 'sha256', $resource, wp_salt( 'nonce' ) ), 0, 40 );
	$now      = time();
	$owner    = $now . ':' . wp_generate_password( 32, false, false );

	if ( add_option( $lock_key, $owner, '', false ) ) {
		return array(
			'key'   => $lock_key,
			'owner' => $owner,
		);
	}

	$current = (string) get_option( $lock_key, '' );
	$parts   = explode( ':', $current, 2 );
	if ( 2 === count( $parts ) && ctype_digit( $parts[0] ) && (int) $parts[0] < $now - 15 ) {
		if ( kototsugi_quick_post_release_lock( array( 'key' => $lock_key, 'owner' => $current ) ) && add_option( $lock_key, $owner, '', false ) ) {
			return array(
				'key'   => $lock_key,
				'owner' => $owner,
			);
		}
	}

	return false;
}

/**
 * Releases a lock only when the caller still owns it.
 *
 * @param array<string, string> $lock Lock owner data.
 * @return bool
 */
function kototsugi_quick_post_release_lock( $lock ) {
	global $wpdb;

	if ( empty( $lock['key'] ) || empty( $lock['owner'] ) ) {
		return false;
	}

	// A value-matched delete prevents stale owners from removing a replacement lock.
	$deleted = $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic compare-and-delete cannot be expressed through the Options API; the exact cache entry is cleared below.
		$wpdb->options,
		array(
			'option_name'  => $lock['key'],
			'option_value' => $lock['owner'],
		),
		array( '%s', '%s' )
	);
	wp_cache_delete( $lock['key'], 'options' );

	return 1 === $deleted;
}

/**
 * Atomically reserves one passphrase verification attempt.
 *
 * @return bool Whether the attempt may proceed.
 */
function kototsugi_claim_quick_post_login_attempt() {
	$key      = kototsugi_quick_post_throttle_key();
	$lock = kototsugi_quick_post_acquire_lock( $key );

	if ( ! $lock ) {
		return false;
	}

	try {
		$count = (int) get_transient( $key );
		if ( $count >= 5 ) {
			return false;
		}

		set_transient( $key, $count + 1, 15 * MINUTE_IN_SECONDS );
		return true;
	} finally {
		kototsugi_quick_post_release_lock( $lock );
	}
}

/**
 * Returns whether a block tree is safe for Quick Post.
 *
 * @param array<int, array<string, mixed>> $blocks      Parsed WordPress blocks.
 * @param int                              $depth       Current nesting depth.
 * @param int|null                         $block_count Running block count.
 * @return bool
 */
function kototsugi_quick_post_blocks_are_allowed( $blocks, $depth = 1, &$block_count = null ) {
	if ( $depth > KOTOTSUGI_QUICK_POST_MAX_BLOCK_DEPTH ) {
		return false;
	}
	if ( null === $block_count ) {
		$block_count = 0;
	}

	$allowed = array(
		'core/code',
		'core/group',
		'core/heading',
		'core/image',
		'core/list',
		'core/list-item',
		'core/paragraph',
		'core/quote',
		'core/separator',
		'core/table',
	);

	foreach ( $blocks as $block ) {
		++$block_count;
		if ( $block_count > KOTOTSUGI_QUICK_POST_MAX_BLOCKS || ! is_array( $block ) ) {
			return false;
		}

		$name = isset( $block['blockName'] ) ? $block['blockName'] : null;

		if ( null === $name ) {
			if ( ! empty( $block['innerHTML'] ) && '' !== trim( $block['innerHTML'] ) ) {
				return false;
			}
		} elseif ( ! in_array( $name, $allowed, true ) ) {
			return false;
		}

		if ( ! empty( $block['innerBlocks'] ) && ! kototsugi_quick_post_blocks_are_allowed( $block['innerBlocks'], $depth + 1, $block_count ) ) {
			return false;
		}
	}

	return true;
}

/**
 * Rebuilds supported block attributes from a narrow server-side allowlist.
 *
 * @param array<int, array<string, mixed>> $blocks Parsed WordPress blocks.
 * @return array<int, array<string, mixed>>
 */
function kototsugi_sanitize_quick_post_blocks( $blocks ) {
	$callout_classes = array(
		'kototsugi-callout',
		'kototsugi-callout--note',
		'kototsugi-callout--tip',
		'kototsugi-callout--important',
		'kototsugi-callout--warning',
		'kototsugi-callout--caution',
	);

	foreach ( $blocks as &$block ) {
		$name       = isset( $block['blockName'] ) ? $block['blockName'] : null;
		$attributes = array();
		$submitted  = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array();

		if ( 'core/heading' === $name && isset( $submitted['level'] ) ) {
			$level = absint( $submitted['level'] );
			if ( $level >= 1 && $level <= 6 && 2 !== $level ) {
				$attributes['level'] = $level;
			}
		} elseif ( 'core/list' === $name && ! empty( $submitted['ordered'] ) ) {
			$attributes['ordered'] = true;
		} elseif ( 'core/group' === $name && isset( $submitted['className'] ) ) {
			$classes = array_filter(
				array_map( 'sanitize_html_class', preg_split( '/\s+/', (string) $submitted['className'] ) ),
				static function ( $class_name ) use ( $callout_classes ) {
					return in_array( $class_name, $callout_classes, true );
				}
			);
			if ( $classes ) {
				$attributes['className'] = implode( ' ', array_unique( $classes ) );
			}
		}

		$block['attrs'] = $attributes;
		if ( ! empty( $block['innerBlocks'] ) ) {
			$block['innerBlocks'] = kototsugi_sanitize_quick_post_blocks( $block['innerBlocks'] );
		}
	}
	unset( $block );

	return $blocks;
}

/**
 * Returns the maximum combined size for Quick Post image attachments.
 *
 * @return int
 */
function kototsugi_quick_post_max_image_bytes() {
	$site_limit = (int) wp_max_upload_size();

	return $site_limit > 0 ? min( 10 * MB_IN_BYTES, $site_limit ) : 10 * MB_IN_BYTES;
}

/**
 * Normalizes a multiple-file upload field.
 *
 * @param array<string, mixed> $files Uploaded file field.
 * @return array<int, array<string, mixed>>
 */
function kototsugi_normalize_quick_post_images( $files ) {
	if ( empty( $files['name'] ) ) {
		return array();
	}

	if ( ! is_array( $files['name'] ) ) {
		return array( $files );
	}

	$normalized = array();
	foreach ( array_keys( $files['name'] ) as $index ) {
		$normalized[] = array(
			'name'     => isset( $files['name'][ $index ] ) ? $files['name'][ $index ] : '',
			'type'     => isset( $files['type'][ $index ] ) ? $files['type'][ $index ] : '',
			'tmp_name' => isset( $files['tmp_name'][ $index ] ) ? $files['tmp_name'][ $index ] : '',
			'error'    => isset( $files['error'][ $index ] ) ? $files['error'][ $index ] : UPLOAD_ERR_NO_FILE,
			'size'     => isset( $files['size'][ $index ] ) ? $files['size'][ $index ] : 0,
		);
	}

	return $normalized;
}

/**
 * Deletes image attachments created during an unsuccessful submission.
 *
 * @param int[] $attachment_ids Attachment IDs.
 */
function kototsugi_delete_quick_post_images( $attachment_ids ) {
	foreach ( $attachment_ids as $attachment_id ) {
		wp_delete_attachment( (int) $attachment_id, true );
	}
}

/**
 * Saves Quick Post image attachments to the Media Library.
 *
 * @param array<string, mixed> $files     Uploaded file field.
 * @param string[]             $alt_texts Submitted alternative text values.
 * @param int                  $post_id   Parent post ID.
 * @param int                  $author_id Attachment author ID.
 * @return int[]|WP_Error
 */
function kototsugi_upload_quick_post_images( $files, $alt_texts, $post_id, $author_id ) {
	$images = kototsugi_normalize_quick_post_images( $files );
	if ( ! $images ) {
		return array();
	}
	if ( ! user_can( $author_id, 'upload_files' ) ) {
		return new WP_Error( 'kototsugi_quick_post_image_forbidden', __( 'The selected post author is not allowed to upload images.', 'kototsugi' ) );
	}
	if ( count( $images ) > KOTOTSUGI_QUICK_POST_MAX_IMAGES ) {
		return new WP_Error( 'kototsugi_quick_post_image_count', __( 'Attach up to 5 images.', 'kototsugi' ) );
	}

	$allowed_mimes  = array( 'image/jpeg', 'image/png', 'image/gif', 'image/webp' );
	$maximum_bytes  = kototsugi_quick_post_max_image_bytes();
	$total_bytes    = 0;
	$attachment_ids = array();

	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';

	foreach ( $images as $index => $image ) {
		$error    = isset( $image['error'] ) ? (int) $image['error'] : UPLOAD_ERR_NO_FILE;
		$size     = isset( $image['size'] ) ? (int) $image['size'] : 0;
		$tmp_name = isset( $image['tmp_name'] ) ? (string) $image['tmp_name'] : '';
		$name     = isset( $image['name'] ) ? sanitize_file_name( wp_unslash( (string) $image['name'] ) ) : '';

		$total_bytes += $size;
		$mime_type    = $tmp_name && is_readable( $tmp_name ) ? wp_get_image_mime( $tmp_name ) : false;
		if ( UPLOAD_ERR_OK !== $error || ! $name || $size < 1 || $size > $maximum_bytes || $total_bytes > $maximum_bytes || ! in_array( $mime_type, $allowed_mimes, true ) ) {
			kototsugi_delete_quick_post_images( $attachment_ids );
			return new WP_Error( 'kototsugi_quick_post_image_invalid', __( 'One or more images could not be uploaded. Use JPEG, PNG, GIF, or WebP images within the site upload limit.', 'kototsugi' ) );
		}

		$default_alt = sanitize_text_field( preg_replace( '/[-_]+/', ' ', pathinfo( $name, PATHINFO_FILENAME ) ) );
		$alt_text    = isset( $alt_texts[ $index ] ) ? sanitize_text_field( $alt_texts[ $index ] ) : $default_alt;
		$upload      = array(
			'name'     => $name,
			'type'     => $mime_type,
			'tmp_name' => $tmp_name,
			'error'    => UPLOAD_ERR_OK,
			'size'     => $size,
		);
		$attachment_id = media_handle_sideload(
			$upload,
			$post_id,
			$alt_text,
			array( 'post_author' => $author_id )
		);

		if ( is_wp_error( $attachment_id ) ) {
			kototsugi_delete_quick_post_images( $attachment_ids );
			return new WP_Error( 'kototsugi_quick_post_image_upload_failed', __( 'One or more images could not be saved to the Media Library.', 'kototsugi' ) );
		}

		update_post_meta( $attachment_id, '_wp_attachment_image_alt', $alt_text );
		$attachment_ids[] = (int) $attachment_id;
	}

	return $attachment_ids;
}

/**
 * Builds image blocks for uploaded Quick Post attachments.
 *
 * @param int[] $attachment_ids Attachment IDs.
 * @return string
 */
function kototsugi_quick_post_image_blocks( $attachment_ids ) {
	$blocks = array();

	foreach ( $attachment_ids as $attachment_id ) {
		$image = wp_get_attachment_image( $attachment_id, 'large', false, array( 'class' => 'wp-image-' . (int) $attachment_id ) );
		if ( ! $image ) {
			continue;
		}

		$attributes = wp_json_encode(
			array(
				'id'              => (int) $attachment_id,
				'sizeSlug'        => 'large',
				'linkDestination' => 'none',
			)
		);
		$blocks[] = '<!-- wp:image ' . $attributes . ' -->' . "\n" . '<figure class="wp-block-image size-large">' . $image . '</figure>' . "\n" . '<!-- /wp:image -->';
	}

	return implode( "\n\n", $blocks );
}

/**
 * Inserts one validated Quick Post article.
 *
 * @param array<string, mixed> $values   Submitted values.
 * @param array<string, mixed> $settings Quick Post settings.
 * @param array<string, mixed> $images   Uploaded image field.
 * @param string[]             $alt_texts Submitted image alternative text.
 * @return int|WP_Error
 */
function kototsugi_insert_quick_post( $values, $settings, $images = array(), $alt_texts = array() ) {
	$title       = sanitize_text_field( isset( $values['title'] ) ? $values['title'] : '' );
	$source      = isset( $values['source'] ) ? (string) $values['source'] : '';
	$content     = isset( $values['content'] ) ? (string) $values['content'] : '';
	$excerpt     = sanitize_textarea_field( isset( $values['excerpt'] ) ? $values['excerpt'] : '' );
	$slug        = sanitize_title( isset( $values['slug'] ) ? $values['slug'] : '' );
	$idempotency = sanitize_key( isset( $values['idempotency'] ) ? $values['idempotency'] : '' );
	$post_type   = isset( $settings['post_type'] ) ? sanitize_key( $settings['post_type'] ) : 'post';
	$type_object = get_post_type_object( $post_type );
	$author      = get_user_by( 'id', (int) $settings['author_id'] );

	if ( ! $title ) {
		return new WP_Error( 'kototsugi_quick_post_title_required', __( 'Enter a post title.', 'kototsugi' ) );
	}
	if ( ! trim( $source ) || strlen( $source ) > KOTOTSUGI_QUICK_POST_MAX_SOURCE_BYTES ) {
		return new WP_Error( 'kototsugi_quick_post_source_invalid', __( 'Enter an article draft up to 2 MB.', 'kototsugi' ) );
	}
	if ( ! trim( $content ) || strlen( $content ) > 4 * MB_IN_BYTES ) {
		return new WP_Error( 'kototsugi_quick_post_content_invalid', __( 'The article could not be converted into a safe post.', 'kototsugi' ) );
	}
	if ( ! $idempotency || strlen( $idempotency ) < 16 ) {
		return new WP_Error( 'kototsugi_quick_post_request_invalid', __( 'Reload the page and try again.', 'kototsugi' ) );
	}
	if ( ! $type_object || ! isset( kototsugi_quick_post_types()[ $post_type ] ) ) {
		return new WP_Error( 'kototsugi_quick_post_type_invalid', __( 'The configured publishing destination is no longer available.', 'kototsugi' ) );
	}
	if ( ! $author || ! user_can( $author, kototsugi_quick_post_create_capability( $type_object ) ) || ( 'publish' === $settings['status'] && ! user_can( $author, $type_object->cap->publish_posts ) ) ) {
		return new WP_Error( 'kototsugi_quick_post_author_invalid', __( 'The configured post author is no longer available.', 'kototsugi' ) );
	}
	if ( kototsugi_normalize_quick_post_images( $images ) && ! user_can( $author, 'upload_files' ) ) {
		return new WP_Error( 'kototsugi_quick_post_image_forbidden', __( 'The selected post author is not allowed to upload images.', 'kototsugi' ) );
	}

	$blocks = parse_blocks( $content );
	if ( ! $blocks || ! kototsugi_quick_post_blocks_are_allowed( $blocks ) ) {
		return new WP_Error( 'kototsugi_quick_post_blocks_invalid', __( 'The converted article contains an unsupported block.', 'kototsugi' ) );
	}

	$duplicate_key = 'kototsugi_qp_post_' . substr( hash_hmac( 'sha256', $idempotency, wp_salt( 'nonce' ) ), 0, 32 );
	$duplicate_lock = kototsugi_quick_post_acquire_lock( $duplicate_key );
	if ( ! $duplicate_lock ) {
		return new WP_Error( 'kototsugi_quick_post_duplicate', __( 'This article was already submitted. Start a new post before submitting again.', 'kototsugi' ) );
	}
	try {
		if ( get_transient( $duplicate_key ) ) {
			return new WP_Error( 'kototsugi_quick_post_duplicate', __( 'This article was already submitted. Start a new post before submitting again.', 'kototsugi' ) );
		}
		set_transient( $duplicate_key, 'pending', 10 * MINUTE_IN_SECONDS );
	} finally {
		kototsugi_quick_post_release_lock( $duplicate_lock );
	}

	$content = wp_kses_post( serialize_blocks( kototsugi_sanitize_quick_post_blocks( $blocks ) ) );
	if ( ! trim( $content ) ) {
		delete_transient( $duplicate_key );
		return new WP_Error( 'kototsugi_quick_post_content_empty', __( 'The article could not be converted into a safe post.', 'kototsugi' ) );
	}

	$post = array(
		'post_type'    => $post_type,
		'post_status'  => 'draft',
		'post_author'  => (int) $settings['author_id'],
		'post_title'   => $title,
		'post_content' => $content,
	);

	if ( $excerpt ) {
		$post['post_excerpt'] = $excerpt;
	}
	if ( $slug ) {
		$post['post_name'] = $slug;
	}
	if ( is_object_in_taxonomy( $post_type, 'category' ) && $settings['category_id'] && term_exists( (int) $settings['category_id'], 'category' ) ) {
		$post['post_category'] = array( (int) $settings['category_id'] );
	}

	$post_id = wp_insert_post( wp_slash( $post ), true );
	if ( is_wp_error( $post_id ) ) {
		delete_transient( $duplicate_key );
		return $post_id;
	}

	$attachment_ids = kototsugi_upload_quick_post_images( $images, $alt_texts, $post_id, (int) $settings['author_id'] );
	if ( is_wp_error( $attachment_ids ) ) {
		wp_delete_post( $post_id, true );
		delete_transient( $duplicate_key );
		return $attachment_ids;
	}
	if ( $attachment_ids ) {
		$image_blocks = kototsugi_quick_post_image_blocks( $attachment_ids );
		$updated      = wp_update_post(
			wp_slash(
				array(
					'ID'           => $post_id,
					'post_content' => $content . "\n\n" . $image_blocks,
				)
			),
			true
		);
		if ( is_wp_error( $updated ) ) {
			kototsugi_delete_quick_post_images( $attachment_ids );
			wp_delete_post( $post_id, true );
			delete_transient( $duplicate_key );
			return new WP_Error( 'kototsugi_quick_post_image_insert_failed', __( 'The attached images could not be added to the article.', 'kototsugi' ) );
		}
	}

	update_post_meta( $post_id, '_kototsugi_quick_post', 1 );
	if ( 'publish' === $settings['status'] ) {
		$published = wp_update_post(
			array(
				'ID'          => $post_id,
				'post_status' => 'publish',
			),
			true
		);
		if ( is_wp_error( $published ) || ! $published ) {
			kototsugi_delete_quick_post_images( $attachment_ids );
			wp_delete_post( $post_id, true );
			delete_transient( $duplicate_key );
			return new WP_Error( 'kototsugi_quick_post_publish_failed', __( 'The article could not be published. Try again or ask the site administrator for help.', 'kototsugi' ) );
		}
	}
	set_transient( $duplicate_key, (int) $post_id, DAY_IN_SECONDS );

	return (int) $post_id;
}

/**
 * Enqueues the standalone screen assets.
 *
 * @param bool $clear_draft     Whether a completed local draft should be cleared.
 * @param bool $include_scripts Whether the interactive converter is needed.
 */
function kototsugi_enqueue_quick_post_assets( $clear_draft = false, $include_scripts = true ) {
	$editor_script = plugin_dir_path( KOTOTSUGI_FILE ) . 'assets/editor.js';
	$quick_script  = plugin_dir_path( KOTOTSUGI_FILE ) . 'assets/quick-post.js';
	$quick_style   = plugin_dir_path( KOTOTSUGI_FILE ) . 'assets/quick-post.css';
	$shared_style  = plugin_dir_path( KOTOTSUGI_FILE ) . 'assets/style.css';

	wp_enqueue_style( 'dashicons' );
	wp_enqueue_style(
		'kototsugi-style',
		KOTOTSUGI_URL . 'assets/style.css',
		array(),
		file_exists( $shared_style ) ? (string) filemtime( $shared_style ) : KOTOTSUGI_VERSION
	);
	kototsugi_enqueue_passphrase_assets();
	wp_enqueue_style(
		'kototsugi-quick-post',
		KOTOTSUGI_URL . 'assets/quick-post.css',
		array( 'dashicons', 'kototsugi-style' ),
		file_exists( $quick_style ) ? (string) filemtime( $quick_style ) : KOTOTSUGI_VERSION
	);

	if ( ! $include_scripts ) {
		return;
	}

	wp_enqueue_script(
		'kototsugi-markdown-runtime',
		KOTOTSUGI_URL . 'assets/editor.js',
		array( 'wp-i18n' ),
		file_exists( $editor_script ) ? (string) filemtime( $editor_script ) : KOTOTSUGI_VERSION,
		true
	);
	wp_set_script_translations( 'kototsugi-markdown-runtime', 'kototsugi', plugin_dir_path( KOTOTSUGI_FILE ) . 'languages' );

	wp_enqueue_script(
		'kototsugi-quick-post',
		KOTOTSUGI_URL . 'assets/quick-post.js',
		array( 'kototsugi-markdown-runtime', 'wp-i18n' ),
		file_exists( $quick_script ) ? (string) filemtime( $quick_script ) : KOTOTSUGI_VERSION,
		true
	);
	wp_set_script_translations( 'kototsugi-quick-post', 'kototsugi', plugin_dir_path( KOTOTSUGI_FILE ) . 'languages' );
	wp_add_inline_script(
		'kototsugi-quick-post',
		'window.kototsugiQuickPostConfig = ' . wp_json_encode(
			array(
				'clearDraft'    => (bool) $clear_draft,
				'labels'        => array(
					'phone' => __( 'Phone', 'kototsugi' ),
					'place' => __( 'Place', 'kototsugi' ),
					'price' => __( 'Price', 'kototsugi' ),
				),
				'maxImageBytes' => kototsugi_quick_post_max_image_bytes(),
				'maxImages'     => KOTOTSUGI_QUICK_POST_MAX_IMAGES,
				'storageKey'    => kototsugi_quick_post_storage_key( kototsugi_get_quick_post_cookie(), kototsugi_get_quick_post_settings() ),
			)
		) . ';',
		'before'
	);
}

/**
 * Enqueues the shared passphrase visibility control.
 */
function kototsugi_enqueue_passphrase_assets() {
	$script = plugin_dir_path( KOTOTSUGI_FILE ) . 'assets/passphrase-toggle.js';
	$style  = plugin_dir_path( KOTOTSUGI_FILE ) . 'assets/passphrase-toggle.css';

	wp_enqueue_style( 'dashicons' );
	wp_enqueue_style(
		'kototsugi-passphrase-toggle',
		KOTOTSUGI_URL . 'assets/passphrase-toggle.css',
		array( 'dashicons' ),
		file_exists( $style ) ? (string) filemtime( $style ) : KOTOTSUGI_VERSION
	);
	wp_enqueue_script(
		'kototsugi-passphrase-toggle',
		KOTOTSUGI_URL . 'assets/passphrase-toggle.js',
		array(),
		file_exists( $script ) ? (string) filemtime( $script ) : KOTOTSUGI_VERSION,
		true
	);
}

/**
 * Prints the standalone HTML shell start.
 *
 * @param string $title Page title.
 */
function kototsugi_quick_post_document_start( $title ) {
	remove_action( 'wp_print_styles', 'print_emoji_styles' );
	?>
	<!doctype html>
	<html <?php language_attributes(); ?>>
	<head>
		<meta charset="<?php bloginfo( 'charset' ); ?>">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<meta name="robots" content="noindex,nofollow">
		<title><?php echo esc_html( $title ); ?></title>
		<?php wp_print_styles(); ?>
		<?php wp_print_head_scripts(); ?>
	</head>
	<body class="kototsugi-quick-post-page">
	<?php
}

/**
 * Prints the standalone HTML shell end.
 */
function kototsugi_quick_post_document_end() {
	wp_print_footer_scripts();
	?>
	</body>
	</html>
	<?php
}

/**
 * Renders the passphrase screen.
 *
 * @param string $error Optional error message.
 */
function kototsugi_render_quick_post_login( $error = '' ) {
	kototsugi_enqueue_quick_post_assets( false, false );
	kototsugi_quick_post_document_start( __( 'KOTOTSUGI Quick Post', 'kototsugi' ) );
	?>
	<main class="kototsugi-quick-shell kototsugi-quick-shell--login">
		<section class="kototsugi-quick-login" aria-labelledby="kototsugi-quick-login-title">
			<p class="kototsugi-quick-brand">KOTOTSUGI <span><?php esc_html_e( 'Quick Post', 'kototsugi' ); ?></span></p>
			<h1 id="kototsugi-quick-login-title"><?php esc_html_e( 'Enter the passphrase', 'kototsugi' ); ?></h1>
			<p><?php esc_html_e( 'Use the passphrase shared by the site administrator.', 'kototsugi' ); ?></p>
			<?php if ( $error ) : ?><div class="kototsugi-quick-notice kototsugi-quick-notice--error" role="alert"><?php echo esc_html( $error ); ?></div><?php endif; ?>
			<form method="post" action="<?php echo esc_url( kototsugi_quick_post_url() ); ?>">
				<input type="hidden" name="kototsugi_action" value="login">
				<input type="hidden" name="kototsugi_login_nonce" value="<?php echo esc_attr( wp_create_nonce( 'kototsugi_quick_post_login' ) ); ?>">
				<label for="kototsugi-quick-passphrase"><?php esc_html_e( 'Passphrase', 'kototsugi' ); ?></label>
				<div class="kototsugi-passphrase-field">
					<input id="kototsugi-quick-passphrase" class="kototsugi-passphrase-input" type="text" name="passphrase" required autocomplete="current-password" inputmode="text" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus>
					<button class="kototsugi-passphrase-toggle" type="button" aria-controls="kototsugi-quick-passphrase" aria-pressed="false" aria-label="<?php esc_attr_e( 'Show passphrase', 'kototsugi' ); ?>" title="<?php esc_attr_e( 'Show passphrase', 'kototsugi' ); ?>" data-kototsugi-passphrase-toggle data-show-label="<?php esc_attr_e( 'Show passphrase', 'kototsugi' ); ?>" data-hide-label="<?php esc_attr_e( 'Hide passphrase', 'kototsugi' ); ?>">
						<span class="dashicons dashicons-visibility" aria-hidden="true"></span>
						<span class="screen-reader-text"><?php esc_html_e( 'Show passphrase', 'kototsugi' ); ?></span>
					</button>
				</div>
				<button class="kototsugi-quick-button kototsugi-quick-button--primary" type="submit"><?php esc_html_e( 'Continue', 'kototsugi' ); ?></button>
			</form>
			<p class="kototsugi-quick-login__retention"><?php esc_html_e( 'This browser stays signed in for 30 days.', 'kototsugi' ); ?></p>
		</section>
	</main>
	<?php
	kototsugi_quick_post_document_end();
}

/**
 * Renders a disabled or unavailable screen.
 *
 * @param string $message Message to display.
 */
function kototsugi_render_quick_post_unavailable( $message ) {
	kototsugi_enqueue_quick_post_assets( false, false );
	kototsugi_quick_post_document_start( __( 'KOTOTSUGI Quick Post', 'kototsugi' ) );
	?>
	<main class="kototsugi-quick-shell kototsugi-quick-shell--login">
		<section class="kototsugi-quick-login">
			<p class="kototsugi-quick-brand">KOTOTSUGI <span><?php esc_html_e( 'Quick Post', 'kototsugi' ); ?></span></p>
			<h1><?php esc_html_e( 'Quick Post is unavailable', 'kototsugi' ); ?></h1>
			<p><?php echo esc_html( $message ); ?></p>
		</section>
	</main>
	<?php
	kototsugi_quick_post_document_end();
}

/**
 * Renders the posting screen.
 *
 * @param array<string, mixed> $settings Quick Post settings.
 * @param string               $error    Optional submission error.
 * @param array<string, mixed> $values   Values to restore after an error.
 */
function kototsugi_render_quick_post_form( $settings, $error = '', $values = array() ) {
	$cookie = kototsugi_get_quick_post_cookie();
	kototsugi_enqueue_quick_post_assets();
	kototsugi_quick_post_document_start( __( 'KOTOTSUGI Quick Post', 'kototsugi' ) );
	?>
	<header class="kototsugi-quick-header">
		<a class="kototsugi-quick-brand" href="<?php echo esc_url( kototsugi_quick_post_url() ); ?>">KOTOTSUGI <span><?php esc_html_e( 'Quick Post', 'kototsugi' ); ?></span></a>
		<form id="kototsugi-quick-logout-form" method="post" action="<?php echo esc_url( kototsugi_quick_post_url() ); ?>">
			<input type="hidden" name="kototsugi_action" value="logout">
			<?php wp_nonce_field( 'kototsugi_quick_post_logout', 'kototsugi_logout_nonce' ); ?>
			<input type="hidden" name="kototsugi_form_token" value="<?php echo esc_attr( kototsugi_quick_post_form_token( 'logout', $cookie ) ); ?>">
			<button class="kototsugi-quick-icon-button" type="submit" aria-label="<?php esc_attr_e( 'Sign out', 'kototsugi' ); ?>" title="<?php esc_attr_e( 'Sign out', 'kototsugi' ); ?>"><span class="dashicons dashicons-exit" aria-hidden="true"></span></button>
		</form>
	</header>
	<main class="kototsugi-quick-shell">
		<form id="kototsugi-quick-post-form" method="post" enctype="multipart/form-data" action="<?php echo esc_url( kototsugi_quick_post_url() ); ?>" data-status="<?php echo esc_attr( $settings['status'] ); ?>">
			<input type="hidden" name="kototsugi_action" value="publish">
			<?php wp_nonce_field( 'kototsugi_quick_post_publish', 'kototsugi_publish_nonce' ); ?>
			<input type="hidden" name="kototsugi_form_token" value="<?php echo esc_attr( kototsugi_quick_post_form_token( 'publish', $cookie ) ); ?>">
			<input id="kototsugi-quick-content" type="hidden" name="content" value="">
			<input id="kototsugi-quick-excerpt" type="hidden" name="excerpt" value="">
			<input id="kototsugi-quick-slug" type="hidden" name="slug" value="">
			<input id="kototsugi-quick-idempotency" type="hidden" name="idempotency" value="">
			<section id="kototsugi-quick-source-step" class="kototsugi-quick-step" aria-labelledby="kototsugi-quick-source-title">
				<p class="kototsugi-quick-step-label"><?php esc_html_e( 'New article', 'kototsugi' ); ?></p>
				<h1 id="kototsugi-quick-source-title"><?php esc_html_e( 'Create an article', 'kototsugi' ); ?></h1>
				<?php if ( $error ) : ?><div class="kototsugi-quick-notice kototsugi-quick-notice--error" role="alert"><?php echo esc_html( $error ); ?></div><?php endif; ?>
				<div class="kototsugi-quick-compose">
					<div class="kototsugi-quick-compose__fields">
						<div class="kototsugi-quick-title-field">
							<label for="kototsugi-quick-title"><?php esc_html_e( 'Title', 'kototsugi' ); ?></label>
							<input id="kototsugi-quick-title" type="text" name="title" maxlength="200" placeholder="<?php esc_attr_e( 'Article title', 'kototsugi' ); ?>" value="<?php echo esc_attr( isset( $values['title'] ) ? $values['title'] : '' ); ?>" required>
							<div id="kototsugi-quick-title-error" class="kototsugi-quick-field-error" role="alert" hidden></div>
						</div>
						<div class="kototsugi-quick-body-field">
							<label for="kototsugi-quick-source"><?php esc_html_e( 'Article text', 'kototsugi' ); ?></label>
							<textarea id="kototsugi-quick-source" name="source" maxlength="2097152" placeholder="<?php esc_attr_e( 'Write the article here', 'kototsugi' ); ?>" required><?php echo esc_textarea( isset( $values['source'] ) ? $values['source'] : '' ); ?></textarea>
							<div id="kototsugi-quick-source-error" class="kototsugi-quick-field-error" role="alert" hidden></div>
						</div>
					</div>
					<aside class="kototsugi-quick-hints" aria-labelledby="kototsugi-quick-hints-title">
						<h2 id="kototsugi-quick-hints-title"><?php esc_html_e( 'Writing hints', 'kototsugi' ); ?></h2>
						<p><?php esc_html_e( 'Writing normally creates paragraphs. Use these hints only when you want more structure.', 'kototsugi' ); ?></p>
						<ul>
							<li><?php esc_html_e( 'Leave a blank line between paragraphs.', 'kototsugi' ); ?></li>
							<li><?php esc_html_e( 'Start a line with ・ to make a list.', 'kototsugi' ); ?></li>
							<li><?php esc_html_e( 'A short line on its own becomes a heading.', 'kototsugi' ); ?></li>
						</ul>
						<details class="kototsugi-quick-hints__more">
							<summary><?php esc_html_e( 'More ways to write', 'kototsugi' ); ?></summary>
							<ul class="kototsugi-quick-hints__notations">
								<li><code>@</code><span><?php esc_html_e( 'Place', 'kototsugi' ); ?></span></li>
								<li><code>!</code><span><?php esc_html_e( 'Important', 'kototsugi' ); ?></span></li>
								<li><code>※</code><span><?php esc_html_e( 'Note', 'kototsugi' ); ?></span></li>
								<li><code>¥</code><span><?php esc_html_e( 'Price', 'kototsugi' ); ?></span></li>
								<li><code>☎</code><span><?php esc_html_e( 'Phone', 'kototsugi' ); ?></span></li>
							</ul>
							<p><?php esc_html_e( 'You can also write labels such as Place: or Phone:.', 'kototsugi' ); ?></p>
						</details>
					</aside>
				</div>
				<div class="kototsugi-quick-actions">
					<div class="kototsugi-quick-actions__tools">
						<input id="kototsugi-quick-images" type="file" name="quick_post_images[]" accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp" multiple hidden>
						<button id="kototsugi-quick-image-button" class="kototsugi-quick-button kototsugi-quick-button--secondary" type="button"><span class="dashicons dashicons-format-image" aria-hidden="true"></span><?php esc_html_e( 'Add images', 'kototsugi' ); ?></button>
					</div>
					<button id="kototsugi-quick-review-button" class="kototsugi-quick-button kototsugi-quick-button--primary" type="button"><?php esc_html_e( 'Review post', 'kototsugi' ); ?><span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span></button>
				</div>
				<div id="kototsugi-quick-image-list" class="kototsugi-quick-image-list" aria-live="polite" hidden></div>
			</section>
			<section id="kototsugi-quick-review-step" class="kototsugi-quick-step" aria-labelledby="kototsugi-quick-review-title" tabindex="-1" hidden>
				<p class="kototsugi-quick-step-label"><?php esc_html_e( 'Review', 'kototsugi' ); ?></p>
				<h1 id="kototsugi-quick-review-title"><?php esc_html_e( 'Check before posting', 'kototsugi' ); ?></h1>
				<p class="kototsugi-quick-intro"><?php esc_html_e( 'Check the title, preview, and any points found in the draft.', 'kototsugi' ); ?></p>
				<div id="kototsugi-quick-issues" class="kototsugi-quick-issues" hidden>
					<h2><?php esc_html_e( 'Points to check', 'kototsugi' ); ?></h2>
					<ul id="kototsugi-quick-issue-list"></ul>
					<label id="kototsugi-quick-warning-confirmation" class="kototsugi-quick-confirmation" hidden><input id="kototsugi-quick-warning-check" type="checkbox"> <span><?php esc_html_e( 'I reviewed these points.', 'kototsugi' ); ?></span></label>
				</div>
				<div class="kototsugi-quick-preview-wrap">
					<h2><?php esc_html_e( 'Preview', 'kototsugi' ); ?></h2>
					<article id="kototsugi-quick-preview" class="kototsugi-quick-preview"></article>
				</div>
				<div class="kototsugi-quick-actions kototsugi-quick-actions--review">
					<button id="kototsugi-quick-back-button" class="kototsugi-quick-button kototsugi-quick-button--secondary" type="button"><span class="dashicons dashicons-arrow-left-alt2" aria-hidden="true"></span><?php esc_html_e( 'Edit draft', 'kototsugi' ); ?></button>
					<button id="kototsugi-quick-submit-button" class="kototsugi-quick-button kototsugi-quick-button--primary" type="submit" disabled><?php echo esc_html( 'publish' === $settings['status'] ? __( 'Publish post', 'kototsugi' ) : __( 'Save draft', 'kototsugi' ) ); ?></button>
				</div>
			</section>
			<noscript><p class="kototsugi-quick-notice kototsugi-quick-notice--error"><?php esc_html_e( 'JavaScript is required to convert the article into WordPress blocks.', 'kototsugi' ); ?></p></noscript>
		</form>
	</main>
	<?php
	kototsugi_quick_post_document_end();
}

/**
 * Renders a successful submission.
 *
 * @param int                  $post_id  Post ID.
 * @param array<string, mixed> $settings Quick Post settings.
 */
function kototsugi_render_quick_post_success( $post_id, $settings ) {
	$post        = get_post( $post_id );
	$storage_key = kototsugi_quick_post_storage_key( kototsugi_get_quick_post_cookie(), $settings );
	kototsugi_enqueue_quick_post_assets( false, false );
	wp_add_inline_script(
		'kototsugi-passphrase-toggle',
		'try { window.localStorage.removeItem(' . wp_json_encode( $storage_key ) . '); window.localStorage.removeItem(' . wp_json_encode( $storage_key . '-title' ) . '); } catch (error) {}',
		'after'
	);
	kototsugi_quick_post_document_start( __( 'Post submitted', 'kototsugi' ) );
	?>
	<main class="kototsugi-quick-shell kototsugi-quick-shell--success">
		<section class="kototsugi-quick-success">
			<span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>
			<p class="kototsugi-quick-brand">KOTOTSUGI <span><?php esc_html_e( 'Quick Post', 'kototsugi' ); ?></span></p>
			<h1><?php echo esc_html( 'publish' === $settings['status'] ? __( 'Post published', 'kototsugi' ) : __( 'Draft saved', 'kototsugi' ) ); ?></h1>
			<?php if ( $post ) : ?><p class="kototsugi-quick-success__title"><?php echo esc_html( get_the_title( $post ) ); ?></p><?php endif; ?>
			<div class="kototsugi-quick-success__actions">
				<?php if ( $post && 'publish' === $post->post_status ) : ?><a class="kototsugi-quick-button kototsugi-quick-button--secondary" href="<?php echo esc_url( get_permalink( $post ) ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'View post', 'kototsugi' ); ?></a><?php endif; ?>
				<a class="kototsugi-quick-button kototsugi-quick-button--primary" href="<?php echo esc_url( kototsugi_quick_post_url() ); ?>"><?php esc_html_e( 'Create another post', 'kototsugi' ); ?></a>
			</div>
		</section>
	</main>
	<?php
	kototsugi_quick_post_document_end();
}

/**
 * Handles and renders the public Quick Post route.
 */
function kototsugi_handle_quick_post_request() {
	if ( ! kototsugi_is_quick_post_request() ) {
		return;
	}

	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Standard cache plugin opt-out constant.
		define( 'DONOTCACHEPAGE', true );
	}
	nocache_headers();
	$settings = kototsugi_get_quick_post_settings();
	kototsugi_switch_quick_post_locale( $settings );

	if ( ! $settings['enabled'] || ! $settings['password_hash'] ) {
		status_header( 404 );
		kototsugi_render_quick_post_unavailable( __( 'Ask the site administrator to enable this posting page.', 'kototsugi' ) );
		exit;
	}

	$cookie        = kototsugi_get_quick_post_cookie();
	$authenticated = kototsugi_verify_quick_post_session( $cookie, $settings );
	$is_post       = isset( $_SERVER['REQUEST_METHOD'] ) && 'POST' === strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) );
	$action        = $is_post && isset( $_POST['kototsugi_action'] ) ? sanitize_key( wp_unslash( $_POST['kototsugi_action'] ) ) : '';

	if ( 'login' === $action ) {
		$nonce      = isset( $_POST['kototsugi_login_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['kototsugi_login_nonce'] ) ) : '';
		// Passwords must be verified byte-for-byte and must not be altered by text sanitizers.
		$passphrase = isset( $_POST['passphrase'] ) ? (string) wp_unslash( $_POST['passphrase'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized

		if ( ! wp_verify_nonce( $nonce, 'kototsugi_quick_post_login' ) ) {
			kototsugi_render_quick_post_login( __( 'The passphrase is not correct.', 'kototsugi' ) );
			exit;
		}
		if ( ! kototsugi_claim_quick_post_login_attempt() ) {
			status_header( 429 );
			kototsugi_render_quick_post_login( __( 'Too many attempts. Wait 15 minutes and try again.', 'kototsugi' ) );
			exit;
		}
		if ( ! wp_check_password( $passphrase, $settings['password_hash'] ) ) {
			kototsugi_render_quick_post_login( __( 'The passphrase is not correct.', 'kototsugi' ) );
			exit;
		}

		delete_transient( kototsugi_quick_post_throttle_key() );
		$cookie = kototsugi_create_quick_post_session( $settings );
		kototsugi_set_quick_post_cookie( $cookie, time() + MONTH_IN_SECONDS );
		wp_safe_redirect( kototsugi_quick_post_url() );
		exit;
	}

	if ( 'logout' === $action && $authenticated ) {
		$nonce = isset( $_POST['kototsugi_logout_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['kototsugi_logout_nonce'] ) ) : '';
		$token = isset( $_POST['kototsugi_form_token'] ) ? sanitize_text_field( wp_unslash( $_POST['kototsugi_form_token'] ) ) : '';
		if ( wp_verify_nonce( $nonce, 'kototsugi_quick_post_logout' ) && kototsugi_verify_quick_post_form_token( $token, 'logout', $cookie ) ) {
			kototsugi_revoke_quick_post_session( $cookie, $settings );
			kototsugi_set_quick_post_cookie( '', time() - HOUR_IN_SECONDS );
		}
		wp_safe_redirect( kototsugi_quick_post_url() );
		exit;
	}

	if ( ! $authenticated ) {
		kototsugi_render_quick_post_login();
		exit;
	}

	if ( 'publish' === $action ) {
		$nonce  = isset( $_POST['kototsugi_publish_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['kototsugi_publish_nonce'] ) ) : '';
		$token  = isset( $_POST['kototsugi_form_token'] ) ? sanitize_text_field( wp_unslash( $_POST['kototsugi_form_token'] ) ) : '';
		$values = array(
			'title'       => isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '',
			// Source is restored into an escaped textarea and must retain Markdown punctuation.
			'source'      => isset( $_POST['source'] ) ? wp_unslash( $_POST['source'] ) : '', // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			// Serialized blocks are parsed against an allowlist and passed through wp_kses_post() before insertion.
			'content'     => isset( $_POST['content'] ) ? wp_unslash( $_POST['content'] ) : '', // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			'excerpt'     => isset( $_POST['excerpt'] ) ? sanitize_textarea_field( wp_unslash( $_POST['excerpt'] ) ) : '',
			'slug'        => isset( $_POST['slug'] ) ? sanitize_title( wp_unslash( $_POST['slug'] ) ) : '',
			'idempotency' => isset( $_POST['idempotency'] ) ? sanitize_key( wp_unslash( $_POST['idempotency'] ) ) : '',
		);

		if ( ! wp_verify_nonce( $nonce, 'kototsugi_quick_post_publish' ) || ! kototsugi_verify_quick_post_form_token( $token, 'publish', $cookie ) ) {
			kototsugi_render_quick_post_form( $settings, __( 'The page expired. Reload it and try again.', 'kototsugi' ), $values );
			exit;
		}

		$image_files = isset( $_FILES['quick_post_images'] ) && is_array( $_FILES['quick_post_images'] ) ? $_FILES['quick_post_images'] : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- PHP-generated upload metadata is validated before sideloading.
		$image_alts  = isset( $_POST['quick_post_image_alt'] ) && is_array( $_POST['quick_post_image_alt'] ) ? array_map( 'sanitize_text_field', wp_unslash( $_POST['quick_post_image_alt'] ) ) : array();
		$post_id     = kototsugi_insert_quick_post( $values, $settings, $image_files, $image_alts );
		if ( is_wp_error( $post_id ) ) {
			kototsugi_render_quick_post_form( $settings, $post_id->get_error_message(), $values );
			exit;
		}

		wp_safe_redirect(
			add_query_arg(
				array(
					'kototsugi-posted'  => (int) $post_id,
					'kototsugi-receipt' => kototsugi_quick_post_receipt_token( $post_id, $cookie ),
				),
				kototsugi_quick_post_url()
			)
		);
		exit;
	}

	$posted_id = isset( $_GET['kototsugi-posted'] ) ? absint( $_GET['kototsugi-posted'] ) : 0;
	$receipt   = isset( $_GET['kototsugi-receipt'] ) ? sanitize_text_field( wp_unslash( $_GET['kototsugi-receipt'] ) ) : '';
	if ( $posted_id && kototsugi_verify_quick_post_receipt_token( $receipt, $posted_id, $cookie ) && get_post_meta( $posted_id, '_kototsugi_quick_post', true ) ) {
		kototsugi_render_quick_post_success( $posted_id, $settings );
		exit;
	}

	kototsugi_render_quick_post_form( $settings );
	exit;
}
add_action( 'template_redirect', 'kototsugi_handle_quick_post_request', 0 );
