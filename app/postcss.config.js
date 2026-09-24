import customProperties from 'postcss-custom-properties';

// Les TV webOS 3 / Tizen 3 ne gèrent pas les variables CSS : elles sont remplacées
// par leur valeur à la compilation (le minifieur supprimerait des doublons « repli + var »).
export default {
  plugins: [customProperties({ preserve: false })],
};
