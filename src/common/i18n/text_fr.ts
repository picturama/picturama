export default {

    common_cancel: 'Annuler',
    common_backToLibrary: 'Retour a la librairie.',
    common_ratio: '{0} de {1}',
    common_error_photoNotExisting: `Cette photo n'existe pas.`,
    common_error_photoNotExisting_desc: `Cette photo n'est plus à l'endroit où elle se trouvait lors du dernier scan. Elle a peut-être été déplacée, supprimée ou se trouve sur un disque qui n'est plus connecté`,

    key_space: ``,  // TODO: 'Space'

    App_error_noWebGL_title: 'WebGL non supporté.',
    App_error_noWebGL_desc: `Pour fonctionner, Picturama a besoin d'une carte graphique avec accélération 3D. Veuillez vérifier dans les paramètres du système si vous pouvez activer l'accélération 3D et redémarrer Picturama.`,

    CropModeToolbar_aspect_free: 'Libre',
    CropModeToolbar_aspect_original: 'Original',
    CropModeToolbar_aspect_square: 'Carré',
    CropModeToolbar_changeToPortrait: 'Passage au portrait',
    CropModeToolbar_changeToLandscape: 'Passage au paysage',
    CropModeToolbar_reset: 'Réinitialiser',
    CropModeToolbar_done: 'Terminer',

    ErrorController_copied: 'Copie du rapport dans le presse-papiers.',

    ErrorToast_title: 'Oh non ! Quelque chose a mal tourné.',
    ErrorToast_hideReport: 'Masquer le rapport',
    ErrorToast_showReport: 'Afficher le rapport',
    ErrorToast_copy: 'Copie',

    ExportDialog_title_one: 'Exporter une photo',
    ExportDialog_title_more: 'Exporter {0} photos',
    ExportDialog_format: 'Format',
    ExportDialog_quality: 'Qualité',
    ExportDialog_quality_low: 'bas ({0}) - la plus petite taille',
    ExportDialog_quality_medium: 'moyen ({0})',
    ExportDialog_quality_high: 'haut ({0})',
    ExportDialog_quality_max: 'maximum ({0})',
    ExportDialog_size: 'Taille',
    ExportDialog_size_S: 'petit ({0})',
    ExportDialog_size_M: 'moyen ({0})',
    ExportDialog_size_L: 'grand ({0})',
    ExportDialog_size_original: 'taille originale',
    ExportDialog_size_custom: 'personnalisée',
    ExportDialog_customSizeSettings: 'Maximum {0} de {1} pixels',
    ExportDialog_customSizeSide_width: 'largeur',
    ExportDialog_customSizeSide_height: 'hauteur',
    ExportDialog_customSizeSide_size: 'taille',
    ExportDialog_privacy: 'Vie privée',
    ExportDialog_removeInfo: 'Supprimer les métadonnées',
    ExportDialog_removeInfo_desc: ``,  // TODO: `This removes extra information like EXIF-Tags from the exported photo. This is information about the camera used, the photo's location or similar.`
    ExportDialog_removeInfo_jpgOnly: ``,  // TODO: 'Extra information is currently only supported for JPG. I.e. extra information is only exported if both the original photo and the exported photo are JPG.'
    ExportDialog_fileName: 'Nom du fichier',
    ExportDialog_fileName_likeOriginal: `Comme l'original`,
    ExportDialog_fileName_sequence: 'séquence',
    ExportDialog_fileName_sequencePrefix: 'Préfixe',
    ExportDialog_fileName_sequencePrefixDefault: 'Photo',
    ExportDialog_fileName_sequenceExample: 'Example: {0}',
    ExportDialog_export: 'Exporter',
    ExportDialog_exportingTo: 'Exporter vers {0}',
    ExportDialog_done_one: 'Exportation de la photo terminée',
    ExportDialog_done_more: 'Exportation des {0} photos terminée',

    ImportProgressButton_phase_scan_dirs: 'Scan des dossiers en cours',
    ImportProgressButton_phase_cleanup: 'Nettoyage en cours',
    ImportProgressButton_phase_import_photos: 'Importation en cours',
    ImportProgressButton_phase_error: 'Le scan a échoué',
    ImportProgressButton_resume: 'Reprendre',
    ImportProgressButton_pause: 'Pause',

    ImportController_importFinished: 'A scanné {0} photos dans {1}',

    Library_noPhotos_title: 'Pas de photos ajoutées',
    Library_noSettings_message: 'Cliquez sur le {0} ci-dessus pour ouvrir les paramètres.',
    Library_noPhotos_message: 'Appuyez sur {0} ou le bouton ci-dessous pour commencer à scanner les dossiers à la recherche de photos.',
    Library_startScanning: 'Commencez à scanner',
    Library_emptyTrash: 'La corbeille est vide',
    Library_emptyFavorites: "Vous n'avez encore marqué aucune photo comme favorite",
    Library_emptyView: "Votre vue actuelle ne correspond à aucune photo",
    Library_selectOtherView: 'Veuillez sélectionner une autre vue en haut à gauche.',

    LibraryFilterButton_shown: 'Montré : {0}',
    LibraryFilterButton_filter_all: 'Toutes les photos',
    LibraryFilterButton_filter_favorites: 'Favoris',
    LibraryFilterButton_filter_processed: 'Éditéé',
    LibraryFilterButton_filter_trash: 'Corbeille',
    LibraryFilterButton_filter_tag: 'Avec tag "{0}"',
    LibraryFilterButton_tag_title: 'Avec tag:',

    LibraryTopBar_emptyTrashQuestion: 'Vous êtes sûr de vouloir vider les corbeilles ?',
    LibraryTopBar_moveToTrash: `Déplacement vers la corbeille du système d'exploitation`,
    LibraryTopBar_emptyTrash: 'Videz la corbeille',

    MainMenu_version: `Version {0}`,
    MainMenu_settings: 'Paramètres',
    MainMenu_quit: `Quitter`,
    MainMenu_file: `Fichier`,
    MainMenu_export: `Exporter des photos`,
    MainMenu_scan: `Recherche d'images`,
    MainMenu_view: `Affichage`,
    MainMenu_toggleFullScreen: `Basculer en plein écran`,
    MainMenu_developer: `Développeur`,
    MainMenu_toggleDevTools: `Activer les outils de développement`,
    MainMenu_toggleUiTester: `Activer l'interface de test`,
    MainMenu_reloadUi: `Recharger l'interface`,

    Picture_showDetails: ``,  // TODO: 'View photo'
    Picture_select: ``,  // TODO: 'Select'
    Picture_deselect: ``,  // TODO: 'Deselect'
    Picture_error_createThumbnail: 'La création de la miniature a échoué',

    PhotoActionButtons_movedToTrash_one: 'Déplacement de la photo à la corbeille',
    PhotoActionButtons_movedToTrash_more: 'Déplacement des {0} photos à la corbeille',
    PhotoActionButtons_restoredFromTrash_one: 'Photo restaurée à partir de la corbeille',
    PhotoActionButtons_restoredFromTrash_more: '{0} photos restaurée à partir de la corbeille',
    PhotoActionButtons_removeFavorite: 'Supprimer des favoris',
    PhotoActionButtons_addFavorite: 'Ajouter aux favoris',
    PhotoActionButtons_trash: 'Déplacer à la corbeille',
    PhotoActionButtons_restoreFromTrash: 'Restaurer de la corbeille',
    PhotoActionButtons_restore: 'Restaurez',
    PhotoActionButtons_photoInfo: 'Afficher les informations sur la photo sélectionnée',
    PhotoActionButtons_export: 'Exportez',

    PhotoDetailPane_prevPhoto: 'Photo précédente',
    PhotoDetailPane_nextPhoto: 'Photo suivante',
    PhotoDetailBody_selected: ``,  // TODO: 'Selected'
    PhotoDetailBody_select: ``,  // TODO: 'Select'
    PhotoDetailPane_edit: 'Éditer',

    PhotoInfo_title: 'Info',
    PhotoInfo_showInFolder: 'Afficher la photo dans le dossier',
    PhotoInfo_copyPath: `Copier le chemin d'accès`,
    PhotoInfo_copyCoordinates: 'Copier les coordonnées',
    PhotoInfo_noSelection_title: 'Aucune photo sélectionnée',
    PhotoInfo_noSelection_message: 'Veuillez sélectionner une photo à gauche.',
    PhotoInfo_exifData: 'Données Exif',
    PhotoInfo_show: 'afficher',
    PhotoInfo_hide: 'masquer',
    PhotoInfo_showAll: 'tout afficher',
    PhotoInfo_showLess: 'afficher moins',
    PhotoInfo_andMore: 'et {0} plus',
    PhotoInfo_exifTitle_ifd0: 'Image (IFD0)',
    PhotoInfo_exifTitle_ifd1: 'Miniature (IFD1)',
    PhotoInfo_noValue: `La photo n'a pas {0}`,
    PhotoInfo_error_fetchPhotoSize: 'Obtention de la taille de la photo échouée',

    RotateButtonGroup_rotateLeft: 'Rotation à gauche',
    RotateButtonGroup_rotateRight: 'Rotation à droite',

    SelectionSummary_selected: '{0} sélectionné',
    SelectionSummary_clearSelection: ``,  // TODO: 'Clear selection'

    Settings_title: 'Paramètres',
    Settings_selectPhotoDirs: 'Veuillez sélectionner les dossiers à scanner pour les images.',
    Settings_photoDirs: 'Dossiers à scanner pour les images:',
    Settings_addPhotoDir: 'Ajouter un dossier de photos',
    Settings_startScan: `Recherche d'images`,

    TagEditor_addTag: 'Ajouter un tag...',
    TagEditor_error_tagExists: 'Veuillez saisir un nouveau tag',

}
